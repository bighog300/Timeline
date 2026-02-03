export const google: {
  auth: {
    JWT: new (options: { email?: string; key?: string; scopes?: string[] }) => any;
  };
  drive: (options: { version: string; auth: any }) => {
    files: {
      list: (args: any) => Promise<{ data: { files?: Array<{ id?: string; name?: string }> } }>;
      create: (args: any) => Promise<{ data: any }>;
      update: (args: any) => Promise<{ data: any }>;
      get: (args: any) => Promise<{ data: any }>;
    };
  };
};
