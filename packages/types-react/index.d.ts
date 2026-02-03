declare namespace React {
  type ReactNode = any;
  interface ReactElement {
    type: any;
    props: any;
    key: string | number | null;
  }
  interface Attributes {
    key?: string | number;
  }
  interface ClassAttributes<T> extends Attributes {
    ref?: any;
  }
  interface FunctionComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactElement | null;
  }
  type FC<P = {}> = FunctionComponent<P>;
}

export = React;
export as namespace React;

declare global {
  namespace JSX {
    interface Element extends React.ReactElement {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
