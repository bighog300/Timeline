export class PrismaClient {
  constructor(options?: any);
  user: {
    create: (args: any) => any;
    upsert: (args: any) => any;
  };
  session: {
    findUnique: (args: any) => any;
    upsert: (args: any) => any;
    delete: (args: any) => any;
    update: (args: any) => any;
    deleteMany: (args: any) => Promise<{ count: number }>;
  };
  googleTokenSet: {
    findUnique: (args: any) => any;
    upsert: (args: any) => any;
    delete: (args: any) => any;
  };
  timelineEntry: {
    findMany: (args: any) => any;
    create: (args: any) => any;
    findUnique: (args: any) => any;
    update: (args: any) => any;
    count: (args: any) => number;
  };
  entrySourceRef: Record<string, any>;
  derivedArtifact: Record<string, any>;
  promptVersion: {
    findMany: (args: any) => any;
    create: (args: any) => any;
    findUnique: (args: any) => any;
    updateMany: (args: any) => any;
    update: (args: any) => any;
  };
  indexPack: {
    findMany: (args: any) => any;
    findUnique: (args: any) => any;
    create: (args: any) => any;
    update: (args: any) => any;
  };
  $transaction: (ops: Promise<any>[]) => Promise<any[]>;
  $disconnect: () => Promise<void>;
}
