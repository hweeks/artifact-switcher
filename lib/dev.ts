import express, { NextFunction, Response } from "express";
import httpG from "http-graceful-shutdown";
import {
  ReqWithUrl,
  setBucketMiddleWare,
  setBucketUrlOnRequest,
  StorageDriver,
} from ".";

// it's the fake DB, this is my avatar
const fakeDb: Record<string, string> = {
  prod: "https://avatars.githubusercontent.com/u/2343787?v=4",
};

// a fake db interface
const db: StorageDriver = {
  get: (env) => {
    return fakeDb[env];
  },
  set: (v, env) => {
    fakeDb[env] = v;
    return true;
  },
};

// express app
const app = express();

// parse that json
app.use(express.json());

// allow setting a new version
app.post("/api/set-new-version", setBucketMiddleWare(db));

// let the middleware find and stream the prod bundle value
app.get(
  "/",
  (req: ReqWithUrl, res: Response, next: NextFunction) => {
    req.envToServe = "prod";
    next();
  },
  setBucketUrlOnRequest(db, true)
);

// start on port 4000
const server = app.listen(4000, () => {
  console.log("up");
});

// handle nodemon shutdown well
httpG(server);
