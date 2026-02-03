declare module "express" {
  function express(): express.Express;

  namespace express {
    function json(): any;
    interface Request {
      session?: any;
      body: any;
      params: any;
      query: any;
      headers?: Record<string, string | undefined>;
    }
    interface Response {
      json: (body: any) => Response;
      status: (code: number) => Response;
    }
    type NextFunction = (err?: any) => void;
    interface Express {
      use: (...args: any[]) => Express;
      get: (...args: any[]) => Express;
      post: (...args: any[]) => Express;
      patch: (...args: any[]) => Express;
      listen: (port: number, callback?: () => void) => any;
    }
  }

  export = express;
}

declare module "express-session" {
  function session(options?: any): any;
  namespace session {
    interface SessionData {
      cookie?: { expires?: Date };
      [key: string]: any;
    }
    class Store {}
  }
  export = session;
}
