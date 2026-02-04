declare module "express" {
  function express(): express.Express;

  namespace express {
    function json(): any;
    interface Request {
      session?: any;
      body: any;
      params: any;
      query: any;
      headers: Record<string, string | undefined>;
      method: string;
      cookies?: Record<string, string>;
      get: (name: string) => string | undefined;
      sessionID?: string;
    }
    interface Response {
      json: (body: any) => Response;
      status: (code: number) => Response;
      redirect: (url: string) => Response;
      setHeader: (name: string, value: string) => Response;
      end: () => Response;
      cookie: (name: string, value: string, options?: any) => Response;
    }
    type NextFunction = (err?: any) => void;
    interface Express {
      use: (...args: any[]) => Express;
      get: (...args: any[]) => Express;
      post: (...args: any[]) => Express;
      patch: (...args: any[]) => Express;
      delete: (...args: any[]) => Express;
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

declare module "cookie-parser" {
  function cookieParser(...args: any[]): any;
  export = cookieParser;
}
