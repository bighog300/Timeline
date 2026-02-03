declare namespace React {
  type FormEvent<T = Element> = {
    preventDefault: () => void;
    target: T;
  };

  function useState<S>(
    initialState: S | (() => S)
  ): [S, (value: S | ((prevState: S) => S)) => void];

  function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;

  function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T;

  function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: ReadonlyArray<unknown>
  ): T;
}
