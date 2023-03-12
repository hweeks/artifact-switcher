import { NextFunction, Request, Response } from "express";
import { URL } from "node:url";
import fetch from "node-fetch";

export const middlewareName = "artifact-switcher";

/**
 * The shape of the json payload to update the database with a new release
 */
interface BucketInfo {
  envTarget: string;
  bucketUrl: string;
}

/**
 * This is here to allow any one of the deployed versions of this app to
 * update any env. The serving of the env you want is already totally up
 * to the consumer, so I assumed similar flexibility was desired for the
 * producer
 */
type baseSetCall = (version: string, env: string) => boolean | Promise<boolean>;

/**
 * We will pass an env, as provided to us on the request, to your database driver,
 * and wait for it to resolve
 */
type baseGetCall = (env: string) => string | Promise<string>;

/**
 * This serves to emulate a storage driver, while allowing the consumer
 * maximum versatility in how they interact with this middleware, while
 * still retaining a stable API
 */
export interface StorageDriver {
  set: baseSetCall;
  get: baseGetCall;
}

/**
 * This is the base Express Request, with the extra info we use
 * to exchange information between your app and this handler
 */
export interface ReqWithUrl extends Request {
  rootHtmlFile?: URL;
  envToServe?: string;
}

/**
 * This middleware checks the request shape, calls the storage driver, and
 * returns done or errors sent to the NextFunction based on the outcome of the
 * business logic
 * @param db This serves as a generic driver for where you store your data.
 * @returns express middleware <void>, calling next with errors if any occur
 */
export const setBucketMiddleWare =
  (db: StorageDriver) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const bucketReq = req.body as BucketInfo;
    if (!(bucketReq.bucketUrl && bucketReq.envTarget)) {
      res.status(403).send("bad request shape");
      next(new Error("no request values set"));
      return;
    }
    const itWorked = await db.set(bucketReq.bucketUrl, bucketReq.envTarget);
    if (!itWorked) {
      res.status(500).send("sorry, we couldn't handle your request");
      next(new Error("no values set to db"));
      return;
    }
    res.send("done");
    next();
    return;
  };

const internalCache = new Map();

/**
 * This function sets a property on the request called rootHtmlFile, a fully
 * qualified URL to the envToServe you set on the request. If the flag is true, we
 * will stream the resultant content directly from the URL you provide to us from the
 * db.
 * @param db This serves as a generic driver for where you store your data.
 * @param streamItForMe A flag to set wether or not we should stream from the bucket for you, or just defer
 * @returns express middleware <void>, calling next with errors if any occur
 */
export const setBucketUrlOnRequest =
  (db: StorageDriver, streamItForMe = false, cacheIt = false) =>
  async <T extends ReqWithUrl>(req: T, res: Response, next: NextFunction) => {
    if (!req.envToServe) {
      res.status(500).send("sorry, we couldn't handle your request");
      next(new Error("no env set"));
      return;
    }
    const foundHtml = internalCache.get(req.envToServe);
    if (cacheIt && foundHtml) {
      res.send(foundHtml);
    }
    const url = await db.get(req.envToServe);
    if (!url) {
      res.status(500).send("sorry, we couldn't handle your request");
      next(new Error("no values returned from db"));
      return;
    }
    req.rootHtmlFile = new URL(url);
    if (streamItForMe && !cacheIt) {
      const fullUrl = req.rootHtmlFile.toString();
      const requestBuilt = await fetch(fullUrl);
      // this is a stream, as we haven't called .toText()
      if (requestBuilt.body?.pipe) {
        requestBuilt.body.pipe(res);
        return;
      }
      res.send("requested resource not found");
    } else if (cacheIt) {
      const fullUrl = req.rootHtmlFile.toString();
      const requestBuilt = await fetch(fullUrl);
      const finalHtml = await requestBuilt.text();
      internalCache.set(req.envToServe, finalHtml);
      res.send(finalHtml);
    }
    next();
  };

/**
 * This function sets a property on the request called rootHtmlFile, a fully
 * qualified URL to the envToServe you set on the request. If the flag is true, we
 * will stream the resultant content directly from the URL you provide to us from the
 * db.
 * @param db This serves as a generic driver for where you store your data.
 * @param streamItForMe A flag to set wether or not we should stream from the bucket for you, or just defer
 * @returns express middleware <void>, calling next with errors if any occur
 */
export const setBucketUrlOnRequestWithHydration =
  (db: StorageDriver, hydrationState: Record<string, string>) =>
  async <T extends ReqWithUrl>(req: T, res: Response, next: NextFunction) => {
    if (!req.envToServe) {
      res.status(500).send("sorry, we couldn't handle your request");
      next(new Error("no env set"));
      return;
    }
    const url = await db.get(req.envToServe);
    if (!url) {
      res.status(500).send("sorry, we couldn't handle your request");
      next(new Error("no values returned from db"));
      return;
    }
    req.rootHtmlFile = new URL(url);
    const fullUrl = req.rootHtmlFile.toString();
    const requestBuilt = await fetch(fullUrl);
    const finalHtml = await requestBuilt.text();
    res.send(
      finalHtml.replace("{{HYDRATION_STATE}}", JSON.stringify(hydrationState))
    );
  };
