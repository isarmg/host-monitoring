import {
  Fragment,
  NA,
  activationCodeForSubmission,
  agentActivationApi,
  agentAuthorizationKeyGuidance,
  canActivatePairing,
  createContext,
  createElement,
  formatMetric,
  formatPercent,
  formatTemperature,
  forwardRef,
  historyValues,
  isNumber,
  latestHistoryValue,
  metricTone,
  monitoringApi,
  statusMeta,
  sumNullable,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "./chunk-3IENDW2S.js";

// src/jsx-runtime.ts
function jsx(type, props, key) {
  return createElement(type, key === void 0 ? props : { ...props, key });
}
var jsxs = jsx;

// node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js
var QueryClientContext = createContext(void 0);
var useQueryClient = (queryClient) => {
  const client = useContext(QueryClientContext);
  if (queryClient) return queryClient;
  if (!client) throw new Error("No QueryClient set, use QueryClientProvider to set one");
  return client;
};
var QueryClientProvider = ({ client, children }) => {
  useEffect(() => {
    client.mount();
    return () => {
      client.unmount();
    };
  }, [client]);
  return /* @__PURE__ */ jsx(QueryClientContext.Provider, {
    value: client,
    children
  });
};

// node_modules/@tanstack/query-core/build/modern/timeoutManager.js
var defaultTimeoutProvider = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timeoutId) => clearTimeout(timeoutId),
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (intervalId) => clearInterval(intervalId)
};
var TimeoutManager = class {
  #provider = defaultTimeoutProvider;
  #providerCalled = false;
  setTimeoutProvider(provider) {
    if (true) {
      if (this.#providerCalled && provider !== this.#provider) console.error(`[timeoutManager]: Switching provider after calls to previous provider might result in unexpected behavior.`, {
        previous: this.#provider,
        provider
      });
    }
    this.#provider = provider;
    if (true) this.#providerCalled = false;
  }
  setTimeout(callback, delay) {
    if (true) this.#providerCalled = true;
    return this.#provider.setTimeout(callback, delay);
  }
  clearTimeout(timeoutId) {
    this.#provider.clearTimeout(timeoutId);
  }
  setInterval(callback, delay) {
    if (true) this.#providerCalled = true;
    return this.#provider.setInterval(callback, delay);
  }
  clearInterval(intervalId) {
    this.#provider.clearInterval(intervalId);
  }
};
var timeoutManager = new TimeoutManager();
function systemSetTimeoutZero(callback) {
  setTimeout(callback, 0);
}

// node_modules/@tanstack/query-core/build/modern/utils.js
var isServer = typeof window === "undefined" || "Deno" in globalThis;
function noop() {
}
function functionalUpdate(updater, input) {
  return typeof updater === "function" ? updater(input) : updater;
}
function isValidTimeout(value) {
  return typeof value === "number" && value >= 0 && value !== Infinity;
}
function timeUntilStale(updatedAt, staleTime) {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
}
function resolveQueryValue(value, query) {
  return typeof value === "function" ? value(query) : value;
}
function matchQuery(filters, query) {
  const { type = "all", exact, fetchStatus, predicate, queryKey, stale } = filters;
  if (queryKey) {
    if (exact) {
      if (query.queryHash !== hashQueryKeyByOptions(queryKey, query.options)) return false;
    } else if (!partialMatchKey(query.queryKey, queryKey)) return false;
  }
  if (type !== "all") {
    const isActive = query.isActive();
    if (type === "active" && !isActive) return false;
    if (type === "inactive" && isActive) return false;
  }
  if (typeof stale === "boolean" && query.isStale() !== stale) return false;
  if (fetchStatus && fetchStatus !== query.state.fetchStatus) return false;
  if (predicate && !predicate(query)) return false;
  return true;
}
function matchMutation(filters, mutation) {
  const { exact, status, predicate, mutationKey } = filters;
  if (mutationKey) {
    if (!mutation.options.mutationKey) return false;
    if (exact) {
      if (hashKey(mutation.options.mutationKey) !== hashKey(mutationKey)) return false;
    } else if (!partialMatchKey(mutation.options.mutationKey, mutationKey)) return false;
  }
  if (status && mutation.state.status !== status) return false;
  if (predicate && !predicate(mutation)) return false;
  return true;
}
function hashQueryKeyByOptions(queryKey, options) {
  return (options?.queryKeyHashFn || hashKey)(queryKey);
}
function hashKey(queryKey) {
  return JSON.stringify(queryKey, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}
function partialMatchKey(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < b.length; i++) if (!partialMatchKey(a[i], b[i])) return false;
      return true;
    }
    const bKeys = Object.keys(b);
    for (const key of bKeys) if (!partialMatchKey(a[key], b[key])) return false;
    return true;
  }
  return false;
}
var hasOwn = Object.prototype.hasOwnProperty;
function replaceEqualDeep(a, b, depth = 0) {
  if (a === b) return a;
  if (depth > 500) return b;
  const array = isPlainArray(a) && isPlainArray(b);
  if (!array && !(isPlainObject(a) && isPlainObject(b))) return b;
  const aSize = (array ? a : Object.keys(a)).length;
  const bItems = array ? b : Object.keys(b);
  const bSize = bItems.length;
  const copy = array ? new Array(bSize) : {};
  let equalItems = 0;
  for (let i = 0; i < bSize; i++) {
    const key = array ? i : bItems[i];
    const aItem = a[key];
    const bItem = b[key];
    if (aItem === bItem) {
      copy[key] = aItem;
      if (array ? i < aSize : hasOwn.call(a, key)) equalItems++;
      continue;
    }
    if (aItem === null || bItem === null || typeof aItem !== "object" || typeof bItem !== "object") {
      copy[key] = bItem;
      continue;
    }
    const v = replaceEqualDeep(aItem, bItem, depth + 1);
    copy[key] = v;
    if (v === aItem) equalItems++;
  }
  return aSize === bSize && equalItems === aSize ? a : copy;
}
function shallowEqualObjects(a, b) {
  if (!b || Object.keys(a).length !== Object.keys(b).length) return false;
  for (const key in a) if (a[key] !== b[key]) return false;
  return true;
}
function isPlainArray(value) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}
function isPlainObject(o) {
  if (!hasObjectPrototype(o)) return false;
  const ctor = o.constructor;
  if (ctor === void 0) return true;
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) return false;
  if (!prot.hasOwnProperty("isPrototypeOf")) return false;
  if (Object.getPrototypeOf(o) !== Object.prototype) return false;
  return true;
}
function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === "[object Object]";
}
function sleep(timeout) {
  return new Promise((resolve) => {
    timeoutManager.setTimeout(resolve, timeout);
  });
}
function replaceData(prevData, data, options) {
  if (typeof options.structuralSharing === "function") return options.structuralSharing(prevData, data);
  else if (options.structuralSharing !== false) {
    if (true) try {
      return replaceEqualDeep(prevData, data);
    } catch (error) {
      console.error(`Structural sharing requires data to be JSON serializable. To fix this, turn off structuralSharing or return JSON-serializable data from your queryFn. [${options.queryHash}]: ${error}`);
      throw error;
    }
    return replaceEqualDeep(prevData, data);
  }
  return data;
}
function addToEnd(items, item, max = 0) {
  const newItems = [...items, item];
  return max && newItems.length > max ? newItems.slice(1) : newItems;
}
function addToStart(items, item, max = 0) {
  const newItems = [item, ...items];
  return max && newItems.length > max ? newItems.slice(0, -1) : newItems;
}
var skipToken = Symbol();
function ensureQueryFn(options, fetchOptions) {
  if (true) {
    if (options.queryFn === skipToken) console.error(`Attempted to invoke queryFn when set to skipToken. This is likely a configuration error. Query hash: '${options.queryHash}'`);
  }
  if (!options.queryFn && fetchOptions?.initialPromise) return () => fetchOptions.initialPromise;
  if (!options.queryFn || options.queryFn === skipToken) return () => Promise.reject(/* @__PURE__ */ new Error(`Missing queryFn: '${options.queryHash}'`));
  return options.queryFn;
}
function shouldThrowError(throwOnError, params) {
  if (typeof throwOnError === "function") return throwOnError(...params);
  return !!throwOnError;
}
function addConsumeAwareSignal(object, getSignal, onCancelled) {
  let consumed = false;
  let signal;
  Object.defineProperty(object, "signal", {
    enumerable: true,
    get: () => {
      signal ??= getSignal();
      if (consumed) return signal;
      consumed = true;
      if (signal.aborted) onCancelled();
      else signal.addEventListener("abort", onCancelled, { once: true });
      return signal;
    }
  });
  return object;
}

// node_modules/@tanstack/query-core/build/modern/environmentManager.js
var isServerFn = () => isServer;
var isServer2 = () => isServerFn();

// node_modules/@tanstack/query-core/build/modern/subscribable.js
var Subscribable = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Set();
    this.subscribe = this.subscribe.bind(this);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    this.onSubscribe();
    return () => {
      this.listeners.delete(listener);
      this.onUnsubscribe();
    };
  }
  hasListeners() {
    return this.listeners.size > 0;
  }
  onSubscribe() {
  }
  onUnsubscribe() {
  }
};

// node_modules/@tanstack/query-core/build/modern/focusManager.js
var FocusManager = class extends Subscribable {
  #focused;
  #cleanup;
  #setup;
  constructor() {
    super();
    this.#setup = (onFocus) => {
      if (typeof window !== "undefined" && window.addEventListener) {
        const listener = () => onFocus();
        window.addEventListener("visibilitychange", listener, false);
        return () => {
          window.removeEventListener("visibilitychange", listener);
        };
      }
    };
  }
  onSubscribe() {
    if (!this.#cleanup) this.setEventListener(this.#setup);
  }
  onUnsubscribe() {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = void 0;
    }
  }
  setEventListener(setup) {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup((focused) => {
      if (typeof focused === "boolean") this.setFocused(focused);
      else this.onFocus();
    });
  }
  setFocused(focused) {
    if (this.#focused !== focused) {
      this.#focused = focused;
      this.onFocus();
    }
  }
  onFocus() {
    const isFocused = this.isFocused();
    this.listeners.forEach((listener) => {
      listener(isFocused);
    });
  }
  isFocused() {
    if (typeof this.#focused === "boolean") return this.#focused;
    return globalThis.document?.visibilityState !== "hidden";
  }
};
var focusManager = new FocusManager();

// node_modules/@tanstack/query-core/build/modern/notifyManager.js
var defaultScheduler = systemSetTimeoutZero;
function createNotifyManager() {
  let queue = [];
  let transactions = 0;
  let notifyFn = (callback) => {
    callback();
  };
  let batchNotifyFn = (callback) => {
    callback();
  };
  let scheduleFn = defaultScheduler;
  const schedule = (callback) => {
    if (transactions) queue.push(callback);
    else scheduleFn(() => {
      notifyFn(callback);
    });
  };
  const flush = () => {
    const originalQueue = queue;
    queue = [];
    if (originalQueue.length) scheduleFn(() => {
      batchNotifyFn(() => {
        originalQueue.forEach((callback) => {
          notifyFn(callback);
        });
      });
    });
  };
  return {
    batch: (callback) => {
      let result;
      transactions++;
      try {
        result = callback();
      } finally {
        transactions--;
        if (!transactions) flush();
      }
      return result;
    },
    /**
    * All calls to the wrapped function will be batched.
    */
    batchCalls: (callback) => {
      return (...args) => {
        schedule(() => {
          callback(...args);
        });
      };
    },
    schedule,
    /**
    * Use this method to set a custom notify function.
    * This can be used to for example wrap notifications with `React.act` while running tests.
    */
    setNotifyFunction: (fn) => {
      notifyFn = fn;
    },
    /**
    * Use this method to set a custom function to batch notifications together into a single tick.
    * By default React Query will use the batch function provided by ReactDOM or React Native.
    */
    setBatchNotifyFunction: (fn) => {
      batchNotifyFn = fn;
    },
    setScheduler: (fn) => {
      scheduleFn = fn;
    }
  };
}
var notifyManager = createNotifyManager();

// node_modules/@tanstack/query-core/build/modern/onlineManager.js
var OnlineManager = class extends Subscribable {
  #online = true;
  #cleanup;
  #setup;
  constructor() {
    super();
    this.#setup = (onOnline) => {
      if (typeof window !== "undefined" && window.addEventListener) {
        const onlineListener = () => onOnline(true);
        const offlineListener = () => onOnline(false);
        window.addEventListener("online", onlineListener, false);
        window.addEventListener("offline", offlineListener, false);
        return () => {
          window.removeEventListener("online", onlineListener);
          window.removeEventListener("offline", offlineListener);
        };
      }
    };
  }
  onSubscribe() {
    if (!this.#cleanup) this.setEventListener(this.#setup);
  }
  onUnsubscribe() {
    if (!this.hasListeners()) {
      this.#cleanup?.();
      this.#cleanup = void 0;
    }
  }
  setEventListener(setup) {
    this.#setup = setup;
    this.#cleanup?.();
    this.#cleanup = setup(this.setOnline.bind(this));
  }
  setOnline(online) {
    if (this.#online !== online) {
      this.#online = online;
      this.listeners.forEach((listener) => {
        listener(online);
      });
    }
  }
  isOnline() {
    return this.#online;
  }
};
var onlineManager = new OnlineManager();

// node_modules/@tanstack/query-core/build/modern/retryer.js
function defaultRetryDelay(failureCount) {
  return Math.min(1e3 * 2 ** failureCount, 3e4);
}
function canFetch(networkMode) {
  return (networkMode ?? "online") === "online" ? onlineManager.isOnline() : true;
}
var CancelledError = class extends Error {
  constructor(options) {
    super("CancelledError");
    this.revert = options?.revert;
    this.silent = options?.silent;
  }
};
function createRetryer(config) {
  let isRetryCancelled = false;
  let failureCount = 0;
  let continueFn;
  let status = "pending";
  let promiseResolve;
  let promiseReject;
  const promise = new Promise((resolve2, reject2) => {
    promiseResolve = resolve2;
    promiseReject = reject2;
  });
  promise.catch(noop);
  const isResolved = () => status !== "pending";
  const cancel = (cancelOptions) => {
    if (!isResolved()) {
      const error = new CancelledError(cancelOptions);
      reject(error);
      config.onCancel?.(error);
    }
  };
  const cancelRetry = () => {
    isRetryCancelled = true;
  };
  const continueRetry = () => {
    isRetryCancelled = false;
  };
  const canContinue = () => focusManager.isFocused() && (config.networkMode === "always" || onlineManager.isOnline()) && config.canRun();
  const canStart = () => canFetch(config.networkMode) && config.canRun();
  const resolve = (value) => {
    if (!isResolved()) {
      continueFn?.();
      status = "resolved";
      promiseResolve(value);
    }
  };
  const reject = (value) => {
    if (!isResolved()) {
      continueFn?.();
      status = "rejected";
      promiseReject(value);
    }
  };
  const pause = () => {
    return new Promise((continueResolve) => {
      continueFn = (value) => {
        if (isResolved() || canContinue()) continueResolve(value);
      };
      config.onPause?.();
    }).then(() => {
      continueFn = void 0;
      if (!isResolved()) config.onContinue?.();
    });
  };
  const run = () => {
    if (isResolved()) return;
    let promiseOrValue;
    const initialPromise = failureCount === 0 ? config.initialPromise : void 0;
    try {
      promiseOrValue = initialPromise ?? config.fn();
    } catch (error) {
      promiseOrValue = Promise.reject(error);
    }
    Promise.resolve(promiseOrValue).then(resolve).catch((error) => {
      if (isResolved()) return;
      const retry = config.retry ?? (isServer2() ? 0 : 3);
      const retryDelay = config.retryDelay ?? defaultRetryDelay;
      const delay = typeof retryDelay === "function" ? retryDelay(failureCount, error) : retryDelay;
      const shouldRetry = retry === true || typeof retry === "number" && failureCount < retry || typeof retry === "function" && retry(failureCount, error);
      if (isRetryCancelled || !shouldRetry) {
        reject(error);
        return;
      }
      failureCount++;
      config.onFail?.(failureCount, error);
      sleep(delay).then(() => {
        return canContinue() ? void 0 : pause();
      }).then(() => {
        if (isRetryCancelled) reject(error);
        else run();
      });
    });
  };
  return {
    promise,
    status: () => status,
    cancel,
    continue: () => {
      continueFn?.();
      return promise;
    },
    cancelRetry,
    continueRetry,
    canStart,
    start: () => {
      if (canStart()) run();
      else pause().then(run);
      return promise;
    }
  };
}

// node_modules/@tanstack/query-core/build/modern/removable.js
var Removable = class {
  #gcTimeout;
  destroy() {
    this.clearGcTimeout();
  }
  scheduleGc() {
    this.clearGcTimeout();
    if (isValidTimeout(this.gcTime)) this.#gcTimeout = timeoutManager.setTimeout(() => {
      this.optionalRemove();
    }, this.gcTime);
  }
  updateGcTime(newGcTime) {
    this.gcTime = Math.max(this.gcTime || 0, newGcTime ?? (isServer2() ? Infinity : 3e5));
  }
  clearGcTimeout() {
    if (this.#gcTimeout !== void 0) {
      timeoutManager.clearTimeout(this.#gcTimeout);
      this.#gcTimeout = void 0;
    }
  }
};

// node_modules/@tanstack/query-core/build/modern/infiniteQueryBehavior.js
function infiniteQueryBehavior(pages) {
  return { onFetch: (context, query) => {
    const options = context.options;
    const direction = context.fetchOptions?.meta?.fetchMore?.direction;
    const oldPages = context.state.data?.pages || [];
    const oldPageParams = context.state.data?.pageParams || [];
    let result = {
      pages: [],
      pageParams: []
    };
    let currentPage = 0;
    const fetchFn = async () => {
      let cancelled = false;
      const addSignalProperty = (object) => {
        addConsumeAwareSignal(object, () => context.signal, () => cancelled = true);
      };
      const queryFn = ensureQueryFn(context.options, context.fetchOptions);
      const fetchPage = async (data, param, previous) => {
        if (cancelled) return Promise.reject(context.signal.reason);
        if (param == null && data.pages.length) return Promise.resolve(data);
        const createQueryFnContext = () => {
          const queryFnContext2 = {
            client: context.client,
            queryKey: context.queryKey,
            pageParam: param,
            direction: previous ? "backward" : "forward",
            meta: context.options.meta
          };
          addSignalProperty(queryFnContext2);
          return queryFnContext2;
        };
        const queryFnContext = createQueryFnContext();
        const page = await queryFn(queryFnContext);
        const { maxPages } = context.options;
        const addTo = previous ? addToStart : addToEnd;
        return {
          pages: addTo(data.pages, page, maxPages),
          pageParams: addTo(data.pageParams, param, maxPages)
        };
      };
      if (direction && oldPages.length) {
        const previous = direction === "backward";
        const pageParamFn = previous ? getPreviousPageParam : getNextPageParam;
        const oldData = {
          pages: oldPages,
          pageParams: oldPageParams
        };
        result = await fetchPage(oldData, pageParamFn(options, oldData), previous);
      } else {
        const remainingPages = pages ?? oldPages.length;
        do {
          const param = currentPage === 0 ? oldPageParams[0] ?? options.initialPageParam : getNextPageParam(options, result);
          if (currentPage > 0 && param == null) break;
          result = await fetchPage(result, param);
          currentPage++;
        } while (currentPage < remainingPages);
      }
      return result;
    };
    if (context.options.persister) context.fetchFn = () => {
      return context.options.persister?.(fetchFn, {
        client: context.client,
        queryKey: context.queryKey,
        meta: context.options.meta,
        signal: context.signal
      }, query);
    };
    else context.fetchFn = fetchFn;
  } };
}
function getNextPageParam(options, { pages, pageParams }) {
  const lastIndex = pages.length - 1;
  return pages.length > 0 ? options.getNextPageParam(pages[lastIndex], pages, pageParams[lastIndex], pageParams) : void 0;
}
function getPreviousPageParam(options, { pages, pageParams }) {
  return pages.length > 0 ? options.getPreviousPageParam?.(pages[0], pages, pageParams[0], pageParams) : void 0;
}

// node_modules/@tanstack/query-core/build/modern/query.js
var Query = class extends Removable {
  #queryType;
  #initialState;
  #revertState;
  #cache;
  #client;
  #retryer;
  #defaultOptions;
  #abortSignalConsumed;
  constructor(config) {
    super();
    this.#abortSignalConsumed = false;
    this.#defaultOptions = config.defaultOptions;
    this.setOptions(config.options);
    this.observers = [];
    this.#client = config.client;
    this.#cache = this.#client.getQueryCache();
    this.queryKey = config.queryKey;
    this.queryHash = config.queryHash;
    this.#initialState = getDefaultState(this.options);
    this.state = config.state ?? this.#initialState;
    this.scheduleGc();
  }
  get meta() {
    return this.options.meta;
  }
  get queryType() {
    return this.#queryType;
  }
  get promise() {
    return this.#retryer?.promise;
  }
  setOptions(options) {
    this.options = {
      ...this.#defaultOptions,
      ...options
    };
    if (options?._type) this.#queryType = options._type;
    this.updateGcTime(this.options.gcTime);
    if (this.state && this.state.data === void 0) {
      const defaultState = getDefaultState(this.options);
      if (defaultState.data !== void 0) {
        this.setState(successState(defaultState.data, defaultState.dataUpdatedAt));
        this.#initialState = defaultState;
      }
    }
  }
  optionalRemove() {
    if (!this.observers.length && this.state.fetchStatus === "idle") this.#cache.remove(this);
  }
  setData(newData, options) {
    const data = replaceData(this.state.data, newData, this.options);
    this.#dispatch({
      data,
      type: "success",
      dataUpdatedAt: options?.updatedAt,
      manual: options?.manual
    });
    return data;
  }
  setState(state) {
    this.#dispatch({
      type: "setState",
      state
    });
  }
  cancel(options) {
    const promise = this.#retryer?.promise;
    this.#retryer?.cancel(options);
    return promise ? promise.then(noop).catch(noop) : Promise.resolve();
  }
  destroy() {
    super.destroy();
    this.cancel({ silent: true });
  }
  get resetState() {
    return this.#initialState;
  }
  reset() {
    this.destroy();
    this.setState(this.resetState);
  }
  isActive() {
    return this.observers.some((observer) => resolveQueryValue(observer.options.enabled, this) !== false);
  }
  isDisabled() {
    if (this.getObserversCount() > 0) return !this.isActive();
    return this.options.queryFn === skipToken || !this.isFetched();
  }
  isFetched() {
    return this.state.dataUpdateCount + this.state.errorUpdateCount > 0;
  }
  isStatic() {
    if (this.getObserversCount() > 0) return this.observers.some((observer) => resolveQueryValue(observer.options.staleTime, this) === "static");
    return false;
  }
  isStale() {
    if (this.getObserversCount() > 0) return this.observers.some((observer) => observer.getCurrentResult().isStale);
    return this.state.data === void 0 || this.state.isInvalidated;
  }
  isStaleByTime(staleTime = 0) {
    if (this.state.data === void 0) return true;
    if (staleTime === "static") return false;
    if (this.state.isInvalidated) return true;
    return !timeUntilStale(this.state.dataUpdatedAt, staleTime);
  }
  onFocus() {
    this.observers.find((x) => x.shouldFetchOnWindowFocus())?.refetch({ cancelRefetch: false });
    this.#retryer?.continue();
  }
  onOnline() {
    this.observers.find((x) => x.shouldFetchOnReconnect())?.refetch({ cancelRefetch: false });
    this.#retryer?.continue();
  }
  addObserver(observer) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
      this.clearGcTimeout();
      this.#cache.notify({
        type: "observerAdded",
        query: this,
        observer
      });
    }
  }
  removeObserver(observer) {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
      if (!this.observers.length) {
        if (this.#retryer) {
          if (this.#abortSignalConsumed || this.state.fetchStatus === "paused" && this.state.status === "pending") this.#retryer.cancel({ revert: true });
          else this.#retryer.cancelRetry();
        }
        this.scheduleGc();
      }
      this.#cache.notify({
        type: "observerRemoved",
        query: this,
        observer
      });
    }
  }
  getObserversCount() {
    return this.observers.length;
  }
  invalidate() {
    if (!this.state.isInvalidated) this.#dispatch({ type: "invalidate" });
  }
  async fetch(options, fetchOptions) {
    if (this.state.fetchStatus !== "idle" && this.#retryer?.status() !== "rejected") {
      if (this.state.data !== void 0 && fetchOptions?.cancelRefetch) this.cancel({ silent: true });
      else if (this.#retryer) {
        this.#retryer.continueRetry();
        return this.#retryer.promise;
      }
    }
    if (options) this.setOptions(options);
    if (!this.options.queryFn) {
      const observer = this.observers.find((x) => x.options.queryFn);
      if (observer) this.setOptions(observer.options);
    }
    if (true) {
      if (!Array.isArray(this.options.queryKey)) console.error(`As of v4, queryKey needs to be an Array. If you are using a string like 'repoData', please change it to an Array, e.g. ['repoData']`);
    }
    const abortController = new AbortController();
    const addSignalProperty = (object) => {
      Object.defineProperty(object, "signal", {
        enumerable: true,
        get: () => {
          this.#abortSignalConsumed = true;
          return abortController.signal;
        }
      });
    };
    const fetchFn = () => {
      const queryFn = ensureQueryFn(this.options, fetchOptions);
      const createQueryFnContext = () => {
        const queryFnContext2 = {
          client: this.#client,
          queryKey: this.queryKey,
          meta: this.meta
        };
        addSignalProperty(queryFnContext2);
        return queryFnContext2;
      };
      const queryFnContext = createQueryFnContext();
      this.#abortSignalConsumed = false;
      if (this.options.persister) return this.options.persister(queryFn, queryFnContext, this);
      return queryFn(queryFnContext);
    };
    const createFetchContext = () => {
      const context2 = {
        fetchOptions,
        options: this.options,
        queryKey: this.queryKey,
        client: this.#client,
        state: this.state,
        fetchFn
      };
      addSignalProperty(context2);
      return context2;
    };
    const context = createFetchContext();
    (this.#queryType === "infinite" ? infiniteQueryBehavior(this.options.pages) : this.options.behavior)?.onFetch(context, this);
    this.#revertState = this.state;
    if (this.state.fetchStatus === "idle" || this.state.fetchMeta !== context.fetchOptions?.meta) this.#dispatch({
      type: "fetch",
      meta: context.fetchOptions?.meta
    });
    const retryer = this.#retryer = createRetryer({
      initialPromise: fetchOptions?.initialPromise,
      fn: context.fetchFn,
      onCancel: (error) => {
        if (error instanceof CancelledError && error.revert) this.setState({
          ...this.#revertState,
          fetchStatus: "idle"
        });
        abortController.abort();
      },
      onFail: (failureCount, error) => {
        this.#dispatch({
          type: "failed",
          failureCount,
          error
        });
      },
      onPause: () => {
        this.#dispatch({ type: "pause" });
      },
      onContinue: () => {
        this.#dispatch({ type: "continue" });
      },
      retry: context.options.retry,
      retryDelay: context.options.retryDelay,
      networkMode: context.options.networkMode,
      canRun: () => true
    });
    try {
      const data = await retryer.start();
      if (data === void 0) {
        if (true) console.error(`Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ${this.queryHash}`);
        throw new Error(`${this.queryHash} data is undefined`);
      }
      this.setData(data);
      this.#cache.config.onSuccess?.(data, this);
      this.#cache.config.onSettled?.(data, this.state.error, this);
      return data;
    } catch (error) {
      if (error instanceof CancelledError) {
        if (error.silent) return this.#retryer.promise;
        else if (error.revert) {
          if (this.state.data === void 0) throw error;
          return this.state.data;
        }
      }
      this.#dispatch({
        type: "error",
        error
      });
      this.#cache.config.onError?.(error, this);
      this.#cache.config.onSettled?.(this.state.data, error, this);
      throw error;
    } finally {
      if (this.#retryer === retryer) this.#retryer = void 0;
      this.scheduleGc();
    }
  }
  #dispatch(action) {
    const reducer = (state) => {
      switch (action.type) {
        case "failed":
          return {
            ...state,
            fetchFailureCount: action.failureCount,
            fetchFailureReason: action.error
          };
        case "pause":
          return {
            ...state,
            fetchStatus: "paused"
          };
        case "continue":
          return {
            ...state,
            fetchStatus: "fetching"
          };
        case "fetch":
          return {
            ...state,
            ...fetchState(state.data, this.options),
            fetchMeta: action.meta ?? null
          };
        case "success":
          const newState = {
            ...state,
            ...successState(action.data, action.dataUpdatedAt),
            dataUpdateCount: state.dataUpdateCount + 1,
            ...!action.manual && {
              fetchStatus: "idle",
              fetchFailureCount: 0,
              fetchFailureReason: null
            }
          };
          this.#revertState = action.manual ? newState : void 0;
          return newState;
        case "error":
          const error = action.error;
          return {
            ...state,
            error,
            errorUpdateCount: state.errorUpdateCount + 1,
            errorUpdatedAt: Date.now(),
            fetchFailureCount: state.fetchFailureCount + 1,
            fetchFailureReason: error,
            fetchStatus: "idle",
            status: "error",
            isInvalidated: true
          };
        case "invalidate":
          return {
            ...state,
            isInvalidated: true
          };
        case "setState":
          return {
            ...state,
            ...action.state
          };
      }
    };
    this.state = reducer(this.state);
    notifyManager.batch(() => {
      this.observers.slice().forEach((observer) => {
        observer.onQueryUpdate();
      });
      this.#cache.notify({
        query: this,
        type: "updated",
        action
      });
    });
  }
};
function fetchState(data, options) {
  return {
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchStatus: canFetch(options.networkMode) ? "fetching" : "paused",
    ...data === void 0 && {
      error: null,
      status: "pending"
    }
  };
}
function successState(data, dataUpdatedAt) {
  return {
    data,
    dataUpdatedAt: dataUpdatedAt ?? Date.now(),
    error: null,
    isInvalidated: false,
    status: "success"
  };
}
function getDefaultState(options) {
  const data = typeof options.initialData === "function" ? options.initialData() : options.initialData;
  const hasData = data !== void 0;
  const initialDataUpdatedAt = hasData ? typeof options.initialDataUpdatedAt === "function" ? options.initialDataUpdatedAt() : options.initialDataUpdatedAt : 0;
  return {
    data,
    dataUpdateCount: 0,
    dataUpdatedAt: hasData ? initialDataUpdatedAt ?? Date.now() : 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: hasData ? "success" : "pending",
    fetchStatus: "idle"
  };
}

// node_modules/@tanstack/query-core/build/modern/queryObserver.js
var QueryObserver = class extends Subscribable {
  #client;
  #currentQuery = void 0;
  #currentQueryInitialState = void 0;
  #currentResult = void 0;
  #currentResultState;
  #currentResultOptions;
  #selectError;
  #selectFn;
  #selectResult;
  #lastQueryWithDefinedData;
  #staleTimeoutId;
  #refetchIntervalId;
  #currentRefetchInterval;
  #trackedProps = /* @__PURE__ */ new Set();
  constructor(client, options) {
    super();
    this.options = options;
    this.#client = client;
    this.#selectError = null;
    this.bindMethods();
    this.setOptions(options);
  }
  bindMethods() {
    this.refetch = this.refetch.bind(this);
  }
  onSubscribe() {
    if (this.listeners.size === 1) {
      this.#currentQuery.addObserver(this);
      if (shouldFetchOnMount(this.#currentQuery, this.options)) this.#executeFetch();
      else this.updateResult();
      this.#updateTimers();
    }
  }
  onUnsubscribe() {
    if (!this.hasListeners()) this.destroy();
  }
  shouldFetchOnReconnect() {
    return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnReconnect);
  }
  shouldFetchOnWindowFocus() {
    return shouldFetchOn(this.#currentQuery, this.options, this.options.refetchOnWindowFocus);
  }
  destroy() {
    this.listeners = /* @__PURE__ */ new Set();
    this.#clearStaleTimeout();
    this.#clearRefetchInterval();
    this.#currentQuery.removeObserver(this);
  }
  setOptions(options) {
    const prevOptions = this.options;
    const prevQuery = this.#currentQuery;
    this.options = this.#client.defaultQueryOptions(options);
    if (this.options.enabled !== void 0 && typeof this.options.enabled !== "boolean" && typeof this.options.enabled !== "function" && typeof resolveQueryValue(this.options.enabled, this.#currentQuery) !== "boolean") throw new Error("Expected enabled to be a boolean or a callback that returns a boolean");
    this.#updateQuery();
    this.#currentQuery.setOptions(this.options);
    if (prevOptions._defaulted && !shallowEqualObjects(this.options, prevOptions)) this.#client.getQueryCache().notify({
      type: "observerOptionsUpdated",
      query: this.#currentQuery,
      observer: this
    });
    const mounted = this.hasListeners();
    if (mounted && shouldFetchOptionally(this.#currentQuery, prevQuery, this.options, prevOptions)) this.#executeFetch();
    this.updateResult();
    if (mounted && (this.#currentQuery !== prevQuery || resolveQueryValue(this.options.enabled, this.#currentQuery) !== resolveQueryValue(prevOptions.enabled, this.#currentQuery) || resolveQueryValue(this.options.staleTime, this.#currentQuery) !== resolveQueryValue(prevOptions.staleTime, this.#currentQuery))) this.#updateStaleTimeout();
    const nextRefetchInterval = this.#computeRefetchInterval();
    if (mounted && (this.#currentQuery !== prevQuery || resolveQueryValue(this.options.enabled, this.#currentQuery) !== resolveQueryValue(prevOptions.enabled, this.#currentQuery) || nextRefetchInterval !== this.#currentRefetchInterval)) this.#updateRefetchInterval(nextRefetchInterval);
  }
  getOptimisticResult(options) {
    const query = this.#client.getQueryCache().build(this.#client, options);
    const result = this.createResult(query, options);
    if (!shallowEqualObjects(this.getCurrentResult(), result)) {
      this.#currentResult = result;
      this.#currentResultOptions = this.options;
      this.#currentResultState = this.#currentQuery.state;
    }
    return result;
  }
  getCurrentResult() {
    return this.#currentResult;
  }
  trackResult(result, onPropTracked) {
    return new Proxy(result, { get: (target, key) => {
      this.trackProp(key);
      onPropTracked?.(key);
      return Reflect.get(target, key);
    } });
  }
  trackProp(key) {
    this.#trackedProps.add(key);
  }
  getCurrentQuery() {
    return this.#currentQuery;
  }
  refetch({ ...options } = {}) {
    return this.fetch({ ...options });
  }
  fetchOptimistic(options) {
    const defaultedOptions = this.#client.defaultQueryOptions(options);
    const query = this.#client.getQueryCache().build(this.#client, defaultedOptions);
    let unsubscribe = () => {
    };
    let resolveEarly;
    const cachePromise = new Promise((resolve) => {
      resolveEarly = resolve;
      unsubscribe = this.#client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.query.queryHash === query.queryHash && query.state.data !== void 0) {
          unsubscribe();
          resolve(this.createResult(query, defaultedOptions));
        }
      });
    });
    return Promise.race([query.fetch().then(() => {
      const result = this.createResult(query, defaultedOptions);
      resolveEarly?.(result);
      return result;
    }).finally(() => {
      unsubscribe();
    }), cachePromise]);
  }
  fetch(fetchOptions) {
    return this.#executeFetch({
      ...fetchOptions,
      cancelRefetch: fetchOptions.cancelRefetch ?? true
    }).then(() => {
      this.updateResult();
      return this.#currentResult;
    });
  }
  #executeFetch(fetchOptions) {
    this.#updateQuery();
    let promise = this.#currentQuery.fetch(this.options, fetchOptions);
    if (!fetchOptions?.throwOnError) promise = promise.catch(noop);
    return promise;
  }
  #shouldScheduleTimer(timeout) {
    return !isServer2() && resolveQueryValue(this.options.enabled, this.#currentQuery) !== false && isValidTimeout(timeout);
  }
  #updateStaleTimeout() {
    this.#clearStaleTimeout();
    const staleTime = resolveQueryValue(this.options.staleTime, this.#currentQuery);
    if (this.#currentResult.isStale || !this.#shouldScheduleTimer(staleTime)) return;
    const timeout = timeUntilStale(this.#currentResult.dataUpdatedAt, staleTime) + 1;
    this.#staleTimeoutId = timeoutManager.setTimeout(() => {
      if (!this.#currentResult.isStale) this.updateResult();
    }, timeout);
  }
  #computeRefetchInterval() {
    return (typeof this.options.refetchInterval === "function" ? this.options.refetchInterval(this.#currentQuery) : this.options.refetchInterval) ?? false;
  }
  #updateRefetchInterval(nextInterval) {
    this.#clearRefetchInterval();
    this.#currentRefetchInterval = nextInterval;
    if (this.#currentRefetchInterval === 0 || !this.#shouldScheduleTimer(this.#currentRefetchInterval)) return;
    this.#refetchIntervalId = timeoutManager.setInterval(() => {
      if (this.options.refetchIntervalInBackground || focusManager.isFocused()) this.#executeFetch();
    }, this.#currentRefetchInterval);
  }
  #updateTimers() {
    this.#updateStaleTimeout();
    this.#updateRefetchInterval(this.#computeRefetchInterval());
  }
  #clearStaleTimeout() {
    if (this.#staleTimeoutId !== void 0) {
      timeoutManager.clearTimeout(this.#staleTimeoutId);
      this.#staleTimeoutId = void 0;
    }
  }
  #clearRefetchInterval() {
    if (this.#refetchIntervalId !== void 0) {
      timeoutManager.clearInterval(this.#refetchIntervalId);
      this.#refetchIntervalId = void 0;
    }
  }
  createResult(query, options) {
    const prevQuery = this.#currentQuery;
    const prevOptions = this.options;
    const prevResult = this.#currentResult;
    const prevResultState = this.#currentResultState;
    const prevResultOptions = this.#currentResultOptions;
    const queryInitialState = query !== prevQuery ? query.state : this.#currentQueryInitialState;
    const { state } = query;
    let newState = { ...state };
    let isPlaceholderData = false;
    let data;
    if (options._optimisticResults) {
      const mounted = this.hasListeners();
      const fetchOnMount = !mounted && shouldFetchOnMount(query, options);
      const fetchOptionally = mounted && shouldFetchOptionally(query, prevQuery, options, prevOptions);
      if (fetchOnMount || fetchOptionally) newState = {
        ...newState,
        ...fetchState(state.data, query.options)
      };
      if (options._optimisticResults === "isRestoring") newState.fetchStatus = "idle";
    }
    let { error, errorUpdatedAt, status } = newState;
    data = newState.data;
    let skipSelect = false;
    if (options.placeholderData !== void 0 && data === void 0 && status === "pending") {
      let placeholderData;
      if (prevResult?.isPlaceholderData && options.placeholderData === prevResultOptions?.placeholderData) {
        placeholderData = prevResult.data;
        skipSelect = true;
      } else placeholderData = typeof options.placeholderData === "function" ? options.placeholderData(this.#lastQueryWithDefinedData?.state.data, this.#lastQueryWithDefinedData) : options.placeholderData;
      if (placeholderData !== void 0) {
        status = "success";
        data = replaceData(prevResult?.data, placeholderData, options);
        isPlaceholderData = true;
      }
    }
    if (options.select && data !== void 0 && !skipSelect) {
      if (prevResult && data === prevResultState?.data && options.select === this.#selectFn) data = this.#selectResult;
      else try {
        this.#selectFn = options.select;
        data = options.select(data);
        data = replaceData(prevResult?.data, data, options);
        this.#selectResult = data;
        this.#selectError = null;
      } catch (selectError) {
        this.#selectError = selectError;
      }
    } else if (data === void 0) this.#selectError = null;
    if (this.#selectError) {
      error = this.#selectError;
      data = this.#selectResult;
      errorUpdatedAt = Date.now();
      status = "error";
      isPlaceholderData = false;
    }
    const isFetching = newState.fetchStatus === "fetching";
    const isPending = status === "pending";
    const isError = status === "error";
    const isLoading = isPending && isFetching;
    const hasData = data !== void 0;
    return {
      status,
      fetchStatus: newState.fetchStatus,
      isPending,
      isSuccess: status === "success",
      isError,
      isInitialLoading: isLoading,
      isLoading,
      data,
      dataUpdatedAt: newState.dataUpdatedAt,
      error,
      errorUpdatedAt,
      failureCount: newState.fetchFailureCount,
      failureReason: newState.fetchFailureReason,
      errorUpdateCount: newState.errorUpdateCount,
      isFetched: query.isFetched(),
      isFetchedAfterMount: newState.dataUpdateCount > queryInitialState.dataUpdateCount || newState.errorUpdateCount > queryInitialState.errorUpdateCount,
      isFetching,
      isRefetching: isFetching && !isPending,
      isLoadingError: isError && !hasData,
      isPaused: newState.fetchStatus === "paused",
      isPlaceholderData,
      isRefetchError: isError && hasData,
      isStale: isStale(query, options),
      refetch: this.refetch,
      isEnabled: resolveQueryValue(options.enabled, query) !== false
    };
  }
  updateResult() {
    const prevResult = this.#currentResult;
    const nextResult = this.createResult(this.#currentQuery, this.options);
    this.#currentResultState = this.#currentQuery.state;
    this.#currentResultOptions = this.options;
    if (this.#currentResultState.data !== void 0) this.#lastQueryWithDefinedData = this.#currentQuery;
    if (shallowEqualObjects(nextResult, prevResult)) return;
    this.#currentResult = nextResult;
    const shouldNotifyListeners = () => {
      if (!prevResult) return true;
      const { notifyOnChangeProps } = this.options;
      const notifyOnChangePropsValue = typeof notifyOnChangeProps === "function" ? notifyOnChangeProps() : notifyOnChangeProps;
      if (notifyOnChangePropsValue === "all" || !notifyOnChangePropsValue && !this.#trackedProps.size) return true;
      const includedProps = new Set(notifyOnChangePropsValue ?? this.#trackedProps);
      if (this.options.throwOnError) includedProps.add("error");
      return Object.keys(this.#currentResult).some((key) => {
        const typedKey = key;
        return this.#currentResult[typedKey] !== prevResult[typedKey] && includedProps.has(typedKey);
      });
    };
    const notifyListeners = shouldNotifyListeners();
    notifyManager.batch(() => {
      if (notifyListeners) this.listeners.forEach((listener) => {
        listener(this.#currentResult);
      });
      this.#client.getQueryCache().notify({
        query: this.#currentQuery,
        type: "observerResultsUpdated"
      });
    });
  }
  #updateQuery() {
    const query = this.#client.getQueryCache().build(this.#client, this.options);
    if (query === this.#currentQuery) return;
    const prevQuery = this.#currentQuery;
    this.#currentQuery = query;
    this.#currentQueryInitialState = query.state;
    if (this.hasListeners()) {
      prevQuery?.removeObserver(this);
      query.addObserver(this);
    }
  }
  onQueryUpdate() {
    this.updateResult();
    if (this.hasListeners()) this.#updateTimers();
  }
};
function shouldLoadOnMount(query, options) {
  return resolveQueryValue(options.enabled, query) !== false && query.state.data === void 0 && !(query.state.status === "error" && resolveQueryValue(options.retryOnMount, query) === false);
}
function shouldFetchOnMount(query, options) {
  return shouldLoadOnMount(query, options) || query.state.data !== void 0 && shouldFetchOn(query, options, options.refetchOnMount);
}
function shouldFetchOn(query, options, field) {
  if (resolveQueryValue(options.enabled, query) !== false && resolveQueryValue(options.staleTime, query) !== "static") {
    const value = typeof field === "function" ? field(query) : field;
    return value === "always" || value !== false && isStale(query, options);
  }
  return false;
}
function shouldFetchOptionally(query, prevQuery, options, prevOptions) {
  return (query !== prevQuery || resolveQueryValue(prevOptions.enabled, query) === false) && (!options.suspense || query.state.status !== "error") && isStale(query, options);
}
function isStale(query, options) {
  return resolveQueryValue(options.enabled, query) !== false && query.isStaleByTime(resolveQueryValue(options.staleTime, query));
}

// node_modules/@tanstack/query-core/build/modern/mutation.js
var Mutation = class extends Removable {
  #client;
  #observers;
  #mutationCache;
  #retryer;
  constructor(config) {
    super();
    this.#client = config.client;
    this.mutationId = config.mutationId;
    this.#mutationCache = config.mutationCache;
    this.#observers = [];
    this.state = config.state || getDefaultState2();
    this.setOptions(config.options);
    this.scheduleGc();
  }
  setOptions(options) {
    this.options = options;
    this.updateGcTime(this.options.gcTime);
  }
  get meta() {
    return this.options.meta;
  }
  addObserver(observer) {
    if (!this.#observers.includes(observer)) {
      this.#observers.push(observer);
      this.clearGcTimeout();
      this.#mutationCache.notify({
        type: "observerAdded",
        mutation: this,
        observer
      });
    }
  }
  removeObserver(observer) {
    this.#observers = this.#observers.filter((x) => x !== observer);
    this.scheduleGc();
    this.#mutationCache.notify({
      type: "observerRemoved",
      mutation: this,
      observer
    });
  }
  optionalRemove() {
    if (!this.#observers.length) {
      if (this.state.status === "pending") this.scheduleGc();
      else this.#mutationCache.remove(this);
    }
  }
  continue() {
    return this.#retryer?.continue() ?? (this.state.status === "pending" ? this.execute(this.state.variables) : Promise.resolve());
  }
  async execute(variables) {
    const onContinue = () => {
      this.#dispatch({ type: "continue" });
    };
    const mutationFnContext = {
      client: this.#client,
      meta: this.options.meta,
      mutationKey: this.options.mutationKey
    };
    const retryer = this.#retryer = createRetryer({
      fn: () => {
        if (!this.options.mutationFn) return Promise.reject(/* @__PURE__ */ new Error("No mutationFn found"));
        return this.options.mutationFn(variables, mutationFnContext);
      },
      onFail: (failureCount, error) => {
        this.#dispatch({
          type: "failed",
          failureCount,
          error
        });
      },
      onPause: () => {
        this.#dispatch({ type: "pause" });
      },
      onContinue,
      retry: this.options.retry ?? 0,
      retryDelay: this.options.retryDelay,
      networkMode: this.options.networkMode,
      canRun: () => this.#mutationCache.canRun(this)
    });
    const restored = this.state.status === "pending";
    const isPaused = !retryer.canStart();
    try {
      if (restored) onContinue();
      else {
        this.#dispatch({
          type: "pending",
          variables,
          isPaused
        });
        if (this.#mutationCache.config.onMutate) await this.#mutationCache.config.onMutate(variables, this, mutationFnContext);
        const context = await this.options.onMutate?.(variables, mutationFnContext);
        if (context !== this.state.context) this.#dispatch({
          type: "pending",
          context,
          variables,
          isPaused
        });
      }
      const data = await retryer.start();
      await this.#mutationCache.config.onSuccess?.(data, variables, this.state.context, this, mutationFnContext);
      await this.options.onSuccess?.(data, variables, this.state.context, mutationFnContext);
      await this.#mutationCache.config.onSettled?.(data, null, this.state.variables, this.state.context, this, mutationFnContext);
      await this.options.onSettled?.(data, null, variables, this.state.context, mutationFnContext);
      this.#dispatch({
        type: "success",
        data
      });
      return data;
    } catch (error) {
      try {
        await this.#mutationCache.config.onError?.(error, variables, this.state.context, this, mutationFnContext);
      } catch (e) {
        Promise.reject(e);
      }
      try {
        await this.options.onError?.(error, variables, this.state.context, mutationFnContext);
      } catch (e) {
        Promise.reject(e);
      }
      try {
        await this.#mutationCache.config.onSettled?.(void 0, error, this.state.variables, this.state.context, this, mutationFnContext);
      } catch (e) {
        Promise.reject(e);
      }
      try {
        await this.options.onSettled?.(void 0, error, variables, this.state.context, mutationFnContext);
      } catch (e) {
        Promise.reject(e);
      }
      this.#dispatch({
        type: "error",
        error
      });
      throw error;
    } finally {
      if (this.#retryer === retryer) this.#retryer = void 0;
      this.#mutationCache.runNext(this);
    }
  }
  #dispatch(action) {
    const reducer = (state) => {
      switch (action.type) {
        case "failed":
          return {
            ...state,
            failureCount: action.failureCount,
            failureReason: action.error
          };
        case "pause":
          return {
            ...state,
            isPaused: true
          };
        case "continue":
          return {
            ...state,
            isPaused: false
          };
        case "pending":
          return {
            ...state,
            context: action.context,
            data: void 0,
            failureCount: 0,
            failureReason: null,
            error: null,
            isPaused: action.isPaused,
            status: "pending",
            variables: action.variables,
            submittedAt: Date.now()
          };
        case "success":
          return {
            ...state,
            data: action.data,
            failureCount: 0,
            failureReason: null,
            error: null,
            status: "success",
            isPaused: false
          };
        case "error":
          return {
            ...state,
            data: void 0,
            error: action.error,
            failureCount: state.failureCount + 1,
            failureReason: action.error,
            isPaused: false,
            status: "error"
          };
      }
    };
    this.state = reducer(this.state);
    notifyManager.batch(() => {
      this.#observers.forEach((observer) => {
        observer.onMutationUpdate(action);
      });
      this.#mutationCache.notify({
        mutation: this,
        type: "updated",
        action
      });
    });
  }
};
function getDefaultState2() {
  return {
    context: void 0,
    data: void 0,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: "idle",
    variables: void 0,
    submittedAt: 0
  };
}

// node_modules/@tanstack/query-core/build/modern/mutationCache.js
var MutationCache = class extends Subscribable {
  #mutations;
  #scopes;
  #mutationId;
  constructor(config = {}) {
    super();
    this.config = config;
    this.#mutations = /* @__PURE__ */ new Set();
    this.#scopes = /* @__PURE__ */ new Map();
    this.#mutationId = 0;
  }
  build(client, options, state) {
    const mutation = new Mutation({
      client,
      mutationCache: this,
      mutationId: ++this.#mutationId,
      options: client.defaultMutationOptions(options),
      state
    });
    this.add(mutation);
    return mutation;
  }
  add(mutation) {
    this.#mutations.add(mutation);
    const scope = scopeFor(mutation);
    if (typeof scope === "string") {
      const scopedMutations = this.#scopes.get(scope);
      if (scopedMutations) scopedMutations.push(mutation);
      else this.#scopes.set(scope, [mutation]);
    }
    this.notify({
      type: "added",
      mutation
    });
  }
  remove(mutation) {
    if (this.#mutations.delete(mutation)) {
      const scope = scopeFor(mutation);
      if (typeof scope === "string") {
        const scopedMutations = this.#scopes.get(scope);
        if (scopedMutations) {
          if (scopedMutations.length > 1) {
            const index = scopedMutations.indexOf(mutation);
            if (index !== -1) scopedMutations.splice(index, 1);
          } else if (scopedMutations[0] === mutation) this.#scopes.delete(scope);
        }
      }
    }
    this.notify({
      type: "removed",
      mutation
    });
  }
  canRun(mutation) {
    const scope = scopeFor(mutation);
    if (typeof scope === "string") {
      const firstPendingMutation = this.#scopes.get(scope)?.find((m) => m.state.status === "pending");
      return !firstPendingMutation || firstPendingMutation === mutation;
    } else return true;
  }
  runNext(mutation) {
    const scope = scopeFor(mutation);
    if (typeof scope === "string") return this.#scopes.get(scope)?.find((m) => m !== mutation && m.state.isPaused)?.continue() ?? Promise.resolve();
    else return Promise.resolve();
  }
  clear() {
    notifyManager.batch(() => {
      this.#mutations.forEach((mutation) => {
        this.notify({
          type: "removed",
          mutation
        });
      });
      this.#mutations.clear();
      this.#scopes.clear();
    });
  }
  getAll() {
    return Array.from(this.#mutations);
  }
  find(filters) {
    const defaultedFilters = {
      exact: true,
      ...filters
    };
    return this.getAll().find((mutation) => matchMutation(defaultedFilters, mutation));
  }
  findAll(filters = {}) {
    return this.getAll().filter((mutation) => matchMutation(filters, mutation));
  }
  notify(event) {
    notifyManager.batch(() => {
      this.listeners.forEach((listener) => {
        listener(event);
      });
    });
  }
  resumePausedMutations() {
    const pausedMutations = this.getAll().filter((x) => x.state.isPaused);
    return notifyManager.batch(() => Promise.all(pausedMutations.map((mutation) => mutation.continue().catch(noop))));
  }
};
function scopeFor(mutation) {
  return mutation.options.scope?.id;
}

// node_modules/@tanstack/query-core/build/modern/mutationObserver.js
var MutationObserver = class extends Subscribable {
  #client;
  #currentResult = void 0;
  #currentMutation;
  #mutateOptions;
  constructor(client, options) {
    super();
    this.#client = client;
    this.setOptions(options);
    this.bindMethods();
    this.#updateResult();
  }
  bindMethods() {
    this.mutate = this.mutate.bind(this);
    this.reset = this.reset.bind(this);
  }
  setOptions(options) {
    const prevOptions = this.options;
    this.options = this.#client.defaultMutationOptions(options);
    if (!shallowEqualObjects(this.options, prevOptions)) this.#client.getMutationCache().notify({
      type: "observerOptionsUpdated",
      mutation: this.#currentMutation,
      observer: this
    });
    if (prevOptions?.mutationKey && this.options.mutationKey && hashKey(prevOptions.mutationKey) !== hashKey(this.options.mutationKey)) this.reset();
    else if (this.#currentMutation?.state.status === "pending") this.#currentMutation.setOptions(this.options);
  }
  onSubscribe() {
    if (this.listeners.size === 1 && this.#currentMutation) {
      this.#currentMutation.addObserver(this);
      this.#updateResult();
    }
  }
  onUnsubscribe() {
    if (!this.hasListeners()) this.#currentMutation?.removeObserver(this);
  }
  onMutationUpdate(action) {
    this.#updateResult();
    this.#notify(action);
  }
  getCurrentResult() {
    return this.#currentResult;
  }
  reset() {
    this.#currentMutation?.removeObserver(this);
    this.#currentMutation = void 0;
    this.#updateResult();
    this.#notify();
  }
  mutate(variables, options) {
    this.#mutateOptions = options;
    this.#currentMutation?.removeObserver(this);
    this.#currentMutation = this.#client.getMutationCache().build(this.#client, this.options);
    this.#currentMutation.addObserver(this);
    return this.#currentMutation.execute(variables);
  }
  #updateResult() {
    const state = this.#currentMutation?.state ?? getDefaultState2();
    this.#currentResult = {
      ...state,
      isPending: state.status === "pending",
      isSuccess: state.status === "success",
      isError: state.status === "error",
      isIdle: state.status === "idle",
      mutate: this.mutate,
      reset: this.reset
    };
  }
  #notify(action) {
    notifyManager.batch(() => {
      if (this.#mutateOptions && this.hasListeners()) {
        const variables = this.#currentResult.variables;
        const onMutateResult = this.#currentResult.context;
        const context = {
          client: this.#client,
          meta: this.options.meta,
          mutationKey: this.options.mutationKey
        };
        if (action?.type === "success") {
          try {
            this.#mutateOptions.onSuccess?.(action.data, variables, onMutateResult, context);
          } catch (e) {
            Promise.reject(e);
          }
          try {
            this.#mutateOptions.onSettled?.(action.data, null, variables, onMutateResult, context);
          } catch (e) {
            Promise.reject(e);
          }
        } else if (action?.type === "error") {
          try {
            this.#mutateOptions.onError?.(action.error, variables, onMutateResult, context);
          } catch (e) {
            Promise.reject(e);
          }
          try {
            this.#mutateOptions.onSettled?.(void 0, action.error, variables, onMutateResult, context);
          } catch (e) {
            Promise.reject(e);
          }
        }
      }
      this.listeners.forEach((listener) => {
        listener(this.#currentResult);
      });
    });
  }
};

// node_modules/@tanstack/query-core/build/modern/queryCache.js
var QueryCache = class extends Subscribable {
  #queries;
  constructor(config = {}) {
    super();
    this.config = config;
    this.#queries = /* @__PURE__ */ new Map();
  }
  build(client, options, state) {
    const queryKey = options.queryKey;
    const queryHash = options.queryHash ?? hashQueryKeyByOptions(queryKey, options);
    let query = this.get(queryHash);
    if (!query) {
      query = new Query({
        client,
        queryKey,
        queryHash,
        options: client.defaultQueryOptions(options),
        state,
        defaultOptions: client.getQueryDefaults(queryKey)
      });
      this.add(query);
    }
    return query;
  }
  add(query) {
    if (!this.#queries.has(query.queryHash)) {
      this.#queries.set(query.queryHash, query);
      this.notify({
        type: "added",
        query
      });
    }
  }
  remove(query) {
    const queryInMap = this.#queries.get(query.queryHash);
    if (queryInMap) {
      query.destroy();
      if (queryInMap === query) this.#queries.delete(query.queryHash);
      this.notify({
        type: "removed",
        query
      });
    }
  }
  clear() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        this.remove(query);
      });
    });
  }
  get(queryHash) {
    return this.#queries.get(queryHash);
  }
  getAll() {
    return [...this.#queries.values()];
  }
  find(filters) {
    const defaultedFilters = {
      exact: true,
      ...filters
    };
    return this.getAll().find((query) => matchQuery(defaultedFilters, query));
  }
  findAll(filters = {}) {
    const queries = this.getAll();
    return Object.keys(filters).length > 0 ? queries.filter((query) => matchQuery(filters, query)) : queries;
  }
  notify(event) {
    notifyManager.batch(() => {
      this.listeners.forEach((listener) => {
        listener(event);
      });
    });
  }
  onFocus() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        query.onFocus();
      });
    });
  }
  onOnline() {
    notifyManager.batch(() => {
      this.getAll().forEach((query) => {
        query.onOnline();
      });
    });
  }
};

// node_modules/@tanstack/query-core/build/modern/queryClient.js
var QueryClient = class {
  #queryCache;
  #mutationCache;
  #defaultOptions;
  #queryDefaults;
  #mutationDefaults;
  #mountCount;
  #unsubscribeFocus;
  #unsubscribeOnline;
  constructor(config = {}) {
    this.#queryCache = config.queryCache || new QueryCache();
    this.#mutationCache = config.mutationCache || new MutationCache();
    this.#defaultOptions = config.defaultOptions || {};
    this.#queryDefaults = /* @__PURE__ */ new Map();
    this.#mutationDefaults = /* @__PURE__ */ new Map();
    this.#mountCount = 0;
  }
  mount() {
    this.#mountCount++;
    if (this.#mountCount !== 1) return;
    this.#unsubscribeFocus = focusManager.subscribe(async (focused) => {
      if (focused) {
        await this.resumePausedMutations();
        this.#queryCache.onFocus();
      }
    });
    this.#unsubscribeOnline = onlineManager.subscribe(async (online) => {
      if (online) {
        await this.resumePausedMutations();
        this.#queryCache.onOnline();
      }
    });
  }
  unmount() {
    this.#mountCount--;
    if (this.#mountCount !== 0) return;
    this.#unsubscribeFocus?.();
    this.#unsubscribeFocus = void 0;
    this.#unsubscribeOnline?.();
    this.#unsubscribeOnline = void 0;
  }
  isFetching(filters) {
    return this.#queryCache.findAll({
      ...filters,
      fetchStatus: "fetching"
    }).length;
  }
  isMutating(filters) {
    return this.#mutationCache.findAll({
      ...filters,
      status: "pending"
    }).length;
  }
  /**
  * Imperative (non-reactive) way to retrieve data for a QueryKey.
  * Should only be used in callbacks or functions where reading the latest data is necessary, e.g. for optimistic updates.
  *
  * Hint: Do not use this function inside a component, because it won't receive updates.
  * Use `useQuery` to create a `QueryObserver` that subscribes to changes.
  */
  getQueryData(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(options.queryHash)?.state.data;
  }
  /**
  * @deprecated Use queryClient.query({ ...options, staleTime: 'static' }) instead. This method will be removed in the next major version.
  */
  ensureQueryData(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    const query = this.#queryCache.build(this, defaultedOptions);
    const cachedData = query.state.data;
    if (cachedData === void 0) return this.fetchQuery(options);
    if (options.revalidateIfStale && query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query))) this.prefetchQuery(defaultedOptions);
    return Promise.resolve(cachedData);
  }
  getQueriesData(filters) {
    return this.#queryCache.findAll(filters).map(({ queryKey, state }) => {
      return [queryKey, state.data];
    });
  }
  setQueryData(queryKey, updater, options) {
    const defaultedOptions = this.defaultQueryOptions({ queryKey });
    const prevData = this.#queryCache.get(defaultedOptions.queryHash)?.state.data;
    const data = functionalUpdate(updater, prevData);
    if (data === void 0) return;
    return this.#queryCache.build(this, defaultedOptions).setData(data, {
      ...options,
      manual: true
    });
  }
  setQueriesData(filters, updater, options) {
    return notifyManager.batch(() => this.#queryCache.findAll(filters).map(({ queryKey }) => [queryKey, this.setQueryData(queryKey, updater, options)]));
  }
  getQueryState(queryKey) {
    const options = this.defaultQueryOptions({ queryKey });
    return this.#queryCache.get(options.queryHash)?.state;
  }
  removeQueries(filters) {
    const queryCache = this.#queryCache;
    notifyManager.batch(() => {
      queryCache.findAll(filters).forEach((query) => {
        queryCache.remove(query);
      });
    });
  }
  resetQueries(filters, options) {
    const queryCache = this.#queryCache;
    return notifyManager.batch(() => {
      const matched = queryCache.findAll(filters);
      const queriesToRefetch = new Set(matched);
      matched.forEach((query) => {
        query.reset();
      });
      return this.refetchQueries({
        type: "active",
        predicate: (query) => queriesToRefetch.has(query)
      }, options);
    });
  }
  cancelQueries(filters, cancelOptions = {}) {
    const defaultedCancelOptions = {
      revert: true,
      ...cancelOptions
    };
    const promises = notifyManager.batch(() => this.#queryCache.findAll(filters).map((query) => query.cancel(defaultedCancelOptions)));
    return Promise.all(promises).then(noop).catch(noop);
  }
  invalidateQueries(filters, options = {}) {
    return notifyManager.batch(() => {
      this.#queryCache.findAll(filters).forEach((query) => {
        query.invalidate();
      });
      if (filters?.refetchType === "none") return Promise.resolve();
      return this.refetchQueries({
        ...filters,
        type: filters?.refetchType ?? filters?.type ?? "active"
      }, options);
    });
  }
  refetchQueries(filters, options = {}) {
    const fetchOptions = {
      ...options,
      cancelRefetch: options.cancelRefetch ?? true
    };
    const promises = notifyManager.batch(() => this.#queryCache.findAll(filters).filter((query) => !query.isDisabled() && !query.isStatic()).map((query) => {
      let promise = query.fetch(void 0, fetchOptions);
      if (!fetchOptions.throwOnError) promise = promise.catch(noop);
      return query.state.fetchStatus === "paused" ? Promise.resolve() : promise;
    }));
    return Promise.all(promises).then(noop);
  }
  async query(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    if (defaultedOptions.retry === void 0) defaultedOptions.retry = false;
    const query = this.#queryCache.build(this, defaultedOptions);
    const queryData = query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query)) ? await query.fetch(defaultedOptions) : query.state.data;
    const select = defaultedOptions.select;
    if (select) return select(queryData);
    return queryData;
  }
  /**
  * @deprecated Use queryClient.query(options) instead. This method will be removed in the next major version.
  */
  fetchQuery(options) {
    const defaultedOptions = this.defaultQueryOptions(options);
    if (defaultedOptions.retry === void 0) defaultedOptions.retry = false;
    const query = this.#queryCache.build(this, defaultedOptions);
    return query.isStaleByTime(resolveQueryValue(defaultedOptions.staleTime, query)) ? query.fetch(defaultedOptions) : Promise.resolve(query.state.data);
  }
  /**
  * @deprecated Use queryClient.query(options) instead. You can swallow errors with `.catch(noop)`. This method will be removed in the next major version.
  */
  prefetchQuery(options) {
    return this.fetchQuery(options).then(noop).catch(noop);
  }
  infiniteQuery(options) {
    options._type = "infinite";
    return this.query(options);
  }
  /**
  * @deprecated Use queryClient.infiniteQuery(options) instead. This method will be removed in the next major version.
  */
  fetchInfiniteQuery(options) {
    options._type = "infinite";
    return this.fetchQuery(options);
  }
  /**
  * @deprecated Use queryClient.infiniteQuery(options) instead. You can swallow errors with `.catch(noop)`. This method will be removed in the next major version.
  */
  prefetchInfiniteQuery(options) {
    return this.fetchInfiniteQuery(options).then(noop).catch(noop);
  }
  /**
  * @deprecated Use queryClient.infiniteQuery({ ...options, staleTime: 'static' }) instead. This method will be removed in the next major version.
  */
  ensureInfiniteQueryData(options) {
    options._type = "infinite";
    return this.ensureQueryData(options);
  }
  resumePausedMutations() {
    if (onlineManager.isOnline()) return this.#mutationCache.resumePausedMutations();
    return Promise.resolve();
  }
  getQueryCache() {
    return this.#queryCache;
  }
  getMutationCache() {
    return this.#mutationCache;
  }
  getDefaultOptions() {
    return this.#defaultOptions;
  }
  setDefaultOptions(options) {
    this.#defaultOptions = options;
  }
  setQueryDefaults(queryKey, options) {
    this.#queryDefaults.set(hashKey(queryKey), {
      queryKey,
      defaultOptions: options
    });
  }
  getQueryDefaults(queryKey) {
    const defaults = [...this.#queryDefaults.values()];
    const result = {};
    defaults.forEach((queryDefault) => {
      if (partialMatchKey(queryKey, queryDefault.queryKey)) Object.assign(result, queryDefault.defaultOptions);
    });
    return result;
  }
  setMutationDefaults(mutationKey, options) {
    this.#mutationDefaults.set(hashKey(mutationKey), {
      mutationKey,
      defaultOptions: options
    });
  }
  getMutationDefaults(mutationKey) {
    const defaults = [...this.#mutationDefaults.values()];
    const result = {};
    defaults.forEach((queryDefault) => {
      if (partialMatchKey(mutationKey, queryDefault.mutationKey)) Object.assign(result, queryDefault.defaultOptions);
    });
    return result;
  }
  defaultQueryOptions(options) {
    if (options._defaulted) return options;
    const defaultedOptions = {
      ...this.#defaultOptions.queries,
      ...this.getQueryDefaults(options.queryKey),
      ...options,
      _defaulted: true
    };
    if (!defaultedOptions.queryHash) defaultedOptions.queryHash = hashQueryKeyByOptions(defaultedOptions.queryKey, defaultedOptions);
    if (defaultedOptions.refetchOnReconnect === void 0) defaultedOptions.refetchOnReconnect = defaultedOptions.networkMode !== "always";
    if (defaultedOptions.throwOnError === void 0) defaultedOptions.throwOnError = !!defaultedOptions.suspense;
    if (!defaultedOptions.networkMode && defaultedOptions.persister) defaultedOptions.networkMode = "offlineFirst";
    if (defaultedOptions.queryFn === skipToken) defaultedOptions.enabled = false;
    return defaultedOptions;
  }
  defaultMutationOptions(options) {
    if (options?._defaulted) return options;
    return {
      ...this.#defaultOptions.mutations,
      ...options?.mutationKey && this.getMutationDefaults(options.mutationKey),
      ...options,
      _defaulted: true
    };
  }
  clear() {
    this.#queryCache.clear();
    this.#mutationCache.clear();
  }
};

// node_modules/@tanstack/react-query/build/modern/IsRestoringProvider.js
var IsRestoringContext = createContext(false);
var useIsRestoring = () => useContext(IsRestoringContext);
var IsRestoringProvider = IsRestoringContext.Provider;

// node_modules/@tanstack/react-query/build/modern/QueryErrorResetBoundary.js
function createValue() {
  let isReset = false;
  return {
    clearReset: () => {
      isReset = false;
    },
    reset: () => {
      isReset = true;
    },
    isReset: () => {
      return isReset;
    }
  };
}
var QueryErrorResetBoundaryContext = createContext(createValue());
var useQueryErrorResetBoundary = () => useContext(QueryErrorResetBoundaryContext);

// node_modules/@tanstack/react-query/build/modern/errorBoundaryUtils.js
var ensurePreventErrorBoundaryRetry = (options, errorResetBoundary, query) => {
  const throwOnError = query?.state.error && typeof options.throwOnError === "function" ? shouldThrowError(options.throwOnError, [query.state.error, query]) : options.throwOnError;
  if (options.suspense || throwOnError) {
    if (!errorResetBoundary.isReset()) options.retryOnMount = false;
  }
};
var useClearResetErrorBoundary = (errorResetBoundary) => {
  useEffect(() => {
    errorResetBoundary.clearReset();
  }, [errorResetBoundary]);
};
var getHasError = ({ result, errorResetBoundary, throwOnError, query, suspense }) => {
  return result.isError && !errorResetBoundary.isReset() && !result.isFetching && query && (suspense && result.data === void 0 || shouldThrowError(throwOnError, [result.error, query]));
};

// node_modules/@tanstack/react-query/build/modern/suspense.js
var ensureSuspenseTimers = (defaultedOptions) => {
  if (defaultedOptions.suspense) {
    const MIN_SUSPENSE_TIME_MS = 1e3;
    const clamp = (value) => value === "static" ? value : Math.max(value ?? MIN_SUSPENSE_TIME_MS, MIN_SUSPENSE_TIME_MS);
    const originalStaleTime = defaultedOptions.staleTime;
    defaultedOptions.staleTime = typeof originalStaleTime === "function" ? (...args) => clamp(originalStaleTime(...args)) : clamp(originalStaleTime);
    if (typeof defaultedOptions.gcTime === "number") defaultedOptions.gcTime = Math.max(defaultedOptions.gcTime, MIN_SUSPENSE_TIME_MS);
  }
};
var shouldSuspend = (defaultedOptions, result) => defaultedOptions?.suspense && result.isPending;
var fetchOptimistic = (defaultedOptions, observer, errorResetBoundary) => observer.fetchOptimistic(defaultedOptions).catch(() => {
  errorResetBoundary.clearReset();
});

// node_modules/@tanstack/react-query/build/modern/useBaseQuery.js
function useBaseQuery(options, Observer, queryClient) {
  if (true) {
    if (typeof options !== "object" || Array.isArray(options)) throw new Error('Bad argument type. Starting with v5, only the "Object" form is allowed when calling query related functions. Please use the error stack to find the culprit call. More info here: https://tanstack.com/query/latest/docs/react/guides/migrating-to-v5#supports-a-single-signature-one-object');
  }
  const isRestoring = useIsRestoring();
  const errorResetBoundary = useQueryErrorResetBoundary();
  const client = useQueryClient(queryClient);
  const defaultedOptions = client.defaultQueryOptions(options);
  const query = client.getQueryCache().get(defaultedOptions.queryHash);
  if (true) {
    if (!defaultedOptions.queryFn) console.error(`[${defaultedOptions.queryHash}]: No queryFn was passed as an option, and no default queryFn was found. The queryFn parameter is only optional when using a default queryFn. More info here: https://tanstack.com/query/latest/docs/framework/react/guides/default-query-function`);
  }
  const subscribed = options.subscribed !== false;
  defaultedOptions._optimisticResults = isRestoring ? "isRestoring" : subscribed ? "optimistic" : void 0;
  ensureSuspenseTimers(defaultedOptions);
  ensurePreventErrorBoundaryRetry(defaultedOptions, errorResetBoundary, query);
  useClearResetErrorBoundary(errorResetBoundary);
  const [observer] = useState(() => new Observer(client, defaultedOptions));
  const result = observer.getOptimisticResult(defaultedOptions);
  const shouldSubscribe = !isRestoring && subscribed;
  useSyncExternalStore(useCallback((onStoreChange) => {
    const unsubscribe = shouldSubscribe ? observer.subscribe(notifyManager.batchCalls(onStoreChange)) : noop;
    observer.updateResult();
    return unsubscribe;
  }, [observer, shouldSubscribe]), () => observer.getCurrentResult(), () => observer.getCurrentResult());
  useEffect(() => {
    observer.setOptions(defaultedOptions);
  }, [defaultedOptions, observer]);
  if (shouldSuspend(defaultedOptions, result)) throw fetchOptimistic(defaultedOptions, observer, errorResetBoundary);
  if (getHasError({
    result,
    errorResetBoundary,
    throwOnError: defaultedOptions.throwOnError,
    query,
    suspense: defaultedOptions.suspense
  })) throw result.error;
  return !defaultedOptions.notifyOnChangeProps ? observer.trackResult(result) : result;
}

// node_modules/@tanstack/react-query/build/modern/useQuery.js
function useQuery(options, queryClient) {
  return useBaseQuery(options, QueryObserver, queryClient);
}

// node_modules/@tanstack/react-query/build/modern/useMutation.js
function useMutation(options, queryClient) {
  const client = useQueryClient(queryClient);
  const [observer] = useState(() => new MutationObserver(client, options));
  useEffect(() => {
    observer.setOptions(options);
  }, [observer, options]);
  const result = useSyncExternalStore(useCallback((onStoreChange) => observer.subscribe(notifyManager.batchCalls(onStoreChange)), [observer]), () => observer.getCurrentResult(), () => observer.getCurrentResult());
  const mutate = useCallback((...args) => {
    observer.mutate(args[0], args[1]).catch(noop);
  }, [observer]);
  if (result.error && shouldThrowError(observer.options.throwOnError, [result.error])) throw result.error;
  return {
    ...result,
    mutate,
    mutateAsync: result.mutate
  };
}

// node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);

// node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};

// node_modules/lucide-react/dist/esm/defaultAttributes.mjs
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};

// node_modules/lucide-react/dist/esm/context.mjs
var LucideContext = createContext({});
var useLucideContext = () => useContext(LucideContext);

// node_modules/lucide-react/dist/esm/Icon.mjs
var Icon = forwardRef(
  ({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
    const {
      size: contextSize = 24,
      strokeWidth: contextStrokeWidth = 2,
      absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
      color: contextColor = "currentColor",
      className: contextClass = ""
    } = useLucideContext() ?? {};
    const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size ?? contextSize ?? defaultAttributes.width,
        height: size ?? contextSize ?? defaultAttributes.height,
        stroke: color ?? contextColor,
        strokeWidth: calculatedStrokeWidth,
        className: mergeClasses("lucide", contextClass, className),
        ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/lucide-react/dist/esm/createLucideIcon.mjs
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef(
    ({ className, ...props }, ref) => createElement(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/activity.mjs
var __iconNode = [
  [
    "path",
    {
      d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
      key: "169zse"
    }
  ]
];
var Activity = createLucideIcon("activity", __iconNode);

// node_modules/lucide-react/dist/esm/icons/bell-dot.mjs
var __iconNode2 = [
  ["path", { d: "M10.268 21a2 2 0 0 0 3.464 0", key: "vwvbt9" }],
  [
    "path",
    {
      d: "M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348",
      key: "xaq59h"
    }
  ],
  ["circle", { cx: "18", cy: "5", r: "3", key: "gq8acd" }]
];
var BellDot = createLucideIcon("bell-dot", __iconNode2);

// node_modules/lucide-react/dist/esm/icons/circle-check.mjs
var __iconNode3 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
var CircleCheck = createLucideIcon("circle-check", __iconNode3);

// node_modules/lucide-react/dist/esm/icons/circuit-board.mjs
var __iconNode4 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M11 9h4a2 2 0 0 0 2-2V3", key: "1ve2rv" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "M7 21v-4a2 2 0 0 1 2-2h4", key: "1fwkro" }],
  ["circle", { cx: "15", cy: "15", r: "2", key: "3i40o0" }]
];
var CircuitBoard = createLucideIcon("circuit-board", __iconNode4);

// node_modules/lucide-react/dist/esm/icons/copy.mjs
var __iconNode5 = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
var Copy = createLucideIcon("copy", __iconNode5);

// node_modules/lucide-react/dist/esm/icons/gauge.mjs
var __iconNode6 = [
  ["path", { d: "m12 14 4-4", key: "9kzdfg" }],
  ["path", { d: "M3.34 19a10 10 0 1 1 17.32 0", key: "19p75a" }]
];
var Gauge = createLucideIcon("gauge", __iconNode6);

// node_modules/lucide-react/dist/esm/icons/hard-drive.mjs
var __iconNode7 = [
  ["path", { d: "M10 16h.01", key: "1bzywj" }],
  [
    "path",
    {
      d: "M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
      key: "18tbho"
    }
  ],
  ["path", { d: "M21.946 12.013H2.054", key: "zqlbp7" }],
  ["path", { d: "M6 16h.01", key: "1pmjb7" }]
];
var HardDrive = createLucideIcon("hard-drive", __iconNode7);

// node_modules/lucide-react/dist/esm/icons/info.mjs
var __iconNode8 = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M12 16v-4", key: "1dtifu" }],
  ["path", { d: "M12 8h.01", key: "e9boi3" }]
];
var Info = createLucideIcon("info", __iconNode8);

// node_modules/lucide-react/dist/esm/icons/key-round.mjs
var __iconNode9 = [
  [
    "path",
    {
      d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
      key: "1s6t7t"
    }
  ],
  ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor", key: "w0ekpg" }]
];
var KeyRound = createLucideIcon("key-round", __iconNode9);

// node_modules/lucide-react/dist/esm/icons/loader-circle.mjs
var __iconNode10 = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
var LoaderCircle = createLucideIcon("loader-circle", __iconNode10);

// node_modules/lucide-react/dist/esm/icons/monitor-cog.mjs
var __iconNode11 = [
  ["path", { d: "M12 17v4", key: "1riwvh" }],
  ["path", { d: "m14.305 7.53.923-.382", key: "1mlnsw" }],
  ["path", { d: "m15.228 4.852-.923-.383", key: "82mpwg" }],
  ["path", { d: "m16.852 3.228-.383-.924", key: "ln4sir" }],
  ["path", { d: "m16.852 8.772-.383.923", key: "1dejw0" }],
  ["path", { d: "m19.148 3.228.383-.924", key: "192kgf" }],
  ["path", { d: "m19.53 9.696-.382-.924", key: "fiavlr" }],
  ["path", { d: "m20.772 4.852.924-.383", key: "1j8mgp" }],
  ["path", { d: "m20.772 7.148.924.383", key: "zix9be" }],
  ["path", { d: "M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7", key: "1tnzv8" }],
  ["path", { d: "M8 21h8", key: "1ev6f3" }],
  ["circle", { cx: "18", cy: "6", r: "3", key: "1h7g24" }]
];
var MonitorCog = createLucideIcon("monitor-cog", __iconNode11);

// node_modules/lucide-react/dist/esm/icons/monitor-dot.mjs
var __iconNode12 = [
  ["path", { d: "M12 17v4", key: "1riwvh" }],
  [
    "path",
    { d: "M22 12.307V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693", key: "1dx6ho" }
  ],
  ["path", { d: "M8 21h8", key: "1ev6f3" }],
  ["circle", { cx: "19", cy: "6", r: "3", key: "108a5v" }]
];
var MonitorDot = createLucideIcon("monitor-dot", __iconNode12);

// node_modules/lucide-react/dist/esm/icons/network.mjs
var __iconNode13 = [
  ["rect", { x: "16", y: "16", width: "6", height: "6", rx: "1", key: "4q2zg0" }],
  ["rect", { x: "2", y: "16", width: "6", height: "6", rx: "1", key: "8cvhb9" }],
  ["rect", { x: "9", y: "2", width: "6", height: "6", rx: "1", key: "1egb70" }],
  ["path", { d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3", key: "1jsf9p" }],
  ["path", { d: "M12 12V8", key: "2874zd" }]
];
var Network = createLucideIcon("network", __iconNode13);

// node_modules/lucide-react/dist/esm/icons/shield-check.mjs
var __iconNode14 = [
  [
    "path",
    {
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      key: "oel41y"
    }
  ],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }]
];
var ShieldCheck = createLucideIcon("shield-check", __iconNode14);

// node_modules/lucide-react/dist/esm/icons/thermometer.mjs
var __iconNode15 = [
  ["path", { d: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z", key: "17jzev" }]
];
var Thermometer = createLucideIcon("thermometer", __iconNode15);

// node_modules/lucide-react/dist/esm/icons/trash-2.mjs
var __iconNode16 = [
  ["path", { d: "M10 11v6", key: "nco0om" }],
  ["path", { d: "M14 11v6", key: "outv1u" }],
  ["path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", key: "miytrc" }],
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", key: "e791ji" }]
];
var Trash2 = createLucideIcon("trash-2", __iconNode16);

// node_modules/lucide-react/dist/esm/icons/x.mjs
var __iconNode17 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("x", __iconNode17);

// src/shared/components/ui.tsx
function CardInner({ children }) {
  return /* @__PURE__ */ jsx("div", { className: "sarmg-card__inner", children });
}
function CardRow({
  label,
  children,
  span,
  row,
  chart
}) {
  const gridRow = row ? String(row) : span ? `span ${span}` : void 0;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `sarmg-card__row${chart ? " sarmg-card__row-chart" : ""}`,
      style: gridRow ? { gridRow } : void 0,
      children: [
        /* @__PURE__ */ jsx("span", { className: "sarmg-card__label", children: label }),
        /* @__PURE__ */ jsx("div", { className: "sarmg-card__content", children })
      ]
    }
  );
}
function TruncatedText({
  children,
  muted = false,
  grow = false,
  className = "",
  ...spanProps
}) {
  const classes = [
    "sarmg-truncate",
    muted ? "sarmg-muted" : "",
    grow ? "sarmg-grow" : "",
    className
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsx("span", { ...spanProps, className: classes, children });
}
function CardActions({
  children,
  label = "\u64CD\u4F5C",
  className = "",
  onClick
}) {
  return /* @__PURE__ */ jsx(CardRow, { label, row: 6, children: /* @__PURE__ */ jsx("div", { className: `sarmg-card__actions${className ? ` ${className}` : ""}`, onClick, children }) });
}
function Sparkline({
  data,
  color = "var(--primary)",
  maxValue
}) {
  const validValues = data.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (validValues.length < 2) return null;
  const W = 200;
  const H = 56;
  const verticalPad = 2;
  const min = Math.min(0, ...validValues);
  const max = Math.max(maxValue ?? Math.max(...validValues), 0, min + 1e-3);
  const range = max - min;
  const tx = (i) => i / (data.length - 1) * W;
  const ty = (v) => H - verticalPad - (v - min) / range * (H - verticalPad * 2);
  const segments = [];
  for (const [index, value] of data.entries()) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const previous = segments.at(-1);
    if (!previous || previous.at(-1).index !== index - 1) segments.push([]);
    segments.at(-1).push({ index, value });
  }
  const pathFor = (segment) => {
    let path = `M ${tx(segment[0].index)} ${ty(segment[0].value)}`;
    for (let position = 1; position < segment.length; position += 1) {
      const previous = segment[position - 1];
      const current = segment[position];
      const cx = (tx(previous.index) + tx(current.index)) / 2;
      path += ` C ${cx} ${ty(previous.value)} ${cx} ${ty(current.value)} ${tx(current.index)} ${ty(current.value)}`;
    }
    return path;
  };
  return /* @__PURE__ */ jsx(
    "svg",
    {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "none",
      width: "100%",
      height: "100%",
      style: { display: "block", position: "absolute", inset: 0 },
      "aria-hidden": "true",
      children: segments.map((segment, index) => {
        if (segment.length === 1) {
          const [{ index: pointIndex, value }] = segment;
          return /* @__PURE__ */ jsx(
            "line",
            {
              x1: tx(pointIndex),
              x2: tx(pointIndex),
              y1: ty(value),
              y2: ty(value),
              stroke: color,
              strokeWidth: 4,
              strokeLinecap: "round",
              vectorEffect: "non-scaling-stroke"
            },
            `${pointIndex}-${index}`
          );
        }
        const path = pathFor(segment);
        const fillPath = `${path} L ${tx(segment.at(-1).index)} ${H} L ${tx(segment[0].index)} ${H} Z`;
        return /* @__PURE__ */ jsxs("g", { children: [
          /* @__PURE__ */ jsx("path", { d: fillPath, style: { fill: color, fillOpacity: 0.12 } }),
          /* @__PURE__ */ jsx("path", { d: path, style: { fill: "none", stroke: color, strokeWidth: 2 }, vectorEffect: "non-scaling-stroke" })
        ] }, `${segment[0].index}-${index}`);
      })
    }
  );
}
function Metric({
  label,
  value,
  detail,
  tone,
  title,
  sparkData,
  sparkColor,
  sparkMax
}) {
  const hasChart = sparkData && sparkData.filter((value2) => typeof value2 === "number" && Number.isFinite(value2)).length >= 2;
  return /* @__PURE__ */ jsx("article", { className: `sarmg-card metric ${tone}`, title, children: /* @__PURE__ */ jsxs(CardInner, { children: [
    /* @__PURE__ */ jsx(CardRow, { label, children: /* @__PURE__ */ jsx("strong", { className: "metric-row-value", children: value }) }),
    /* @__PURE__ */ jsx(CardRow, { label: "\u8BE6\u60C5", children: detail ? /* @__PURE__ */ jsx("span", { className: "metric-row-detail", children: detail }) : null }),
    hasChart ? /* @__PURE__ */ jsx("div", { className: "card-spark-row metric-chart-slot", children: /* @__PURE__ */ jsx(Sparkline, { data: sparkData, color: sparkColor ?? "var(--primary)", maxValue: sparkMax }) }) : null
  ] }) });
}
function ActionButton({
  icon: Icon2,
  label,
  busy,
  disabled,
  tone = "primary",
  onClick
}) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      className: `action-button ${tone}`,
      type: "button",
      onClick,
      disabled: busy || disabled,
      title: label,
      children: [
        busy ? /* @__PURE__ */ jsx(LoaderCircle, { className: "spin", size: 16 }) : /* @__PURE__ */ jsx(Icon2, { size: 16 }),
        /* @__PURE__ */ jsx("span", { children: label })
      ]
    }
  );
}
function SectionHeader({
  icon: Icon2,
  title,
  description,
  actions
}) {
  return /* @__PURE__ */ jsxs("div", { className: "section-header", children: [
    /* @__PURE__ */ jsx(ContentTitle, { icon: Icon2, title, description }),
    actions ? /* @__PURE__ */ jsx("div", { className: "section-actions", children: actions }) : null
  ] });
}
function ContentTitle({ icon: Icon2, title, description }) {
  return /* @__PURE__ */ jsxs("div", { className: "section-title", children: [
    /* @__PURE__ */ jsx(Icon2, { size: 18 }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h2", { children: title }),
      description ? /* @__PURE__ */ jsx("p", { children: description }) : null
    ] })
  ] });
}
function StatusLed({ tone }) {
  return /* @__PURE__ */ jsx("span", { className: `sarmg-status-led sarmg-status-${tone}`, "aria-hidden": "true" });
}
function InlineNotice({
  tone,
  text
}) {
  return /* @__PURE__ */ jsxs("div", { className: `inline-notice ${tone}`, role: tone === "danger" ? "alert" : "status", "aria-live": tone === "danger" ? "assertive" : "polite", children: [
    /* @__PURE__ */ jsx(BellDot, { size: 16, "aria-hidden": "true" }),
    /* @__PURE__ */ jsx("span", { children: text })
  ] });
}
function MutationError({
  mutation
}) {
  if (!mutation.isError || !mutation.error) {
    return null;
  }
  return /* @__PURE__ */ jsx(InlineNotice, { tone: "danger", text: mutation.error.message });
}
function LoadingBlock({ label }) {
  return /* @__PURE__ */ jsxs("div", { className: "loading-block", role: "status", "aria-live": "polite", children: [
    /* @__PURE__ */ jsx(LoaderCircle, { className: "spin", size: 18, "aria-hidden": "true" }),
    /* @__PURE__ */ jsx("span", { children: label })
  ] });
}

// src/features/agent-activation/queryKeys.ts
var agentActivationQueryKeys = {
  agentActivation: {
    pairingRequest: (requestId) => ["agent-pairing-request", requestId]
  }
};

// src/shared/lib/format.ts
var U64_MAX = 18446744073709551615n;
function exactUnsigned(value) {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed <= U64_MAX ? parsed : null;
  } catch {
    return null;
  }
}
function formatBytes(bytes) {
  const exact = exactUnsigned(bytes);
  const numeric = exact === null ? typeof bytes === "number" ? bytes : 0 : Number(exact);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = numeric;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
function formatBytesPerSecond(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}
function formatInteger(value) {
  return exactUnsigned(value)?.toLocaleString("zh-CN") ?? "-";
}
function addJsonU64(left, right) {
  return (exactUnsigned(left) ?? 0n) + (exactUnsigned(right) ?? 0n);
}
function subtractJsonU64(total, available) {
  const exactTotal = exactUnsigned(total) ?? 0n;
  const exactAvailable = exactUnsigned(available) ?? 0n;
  return exactTotal > exactAvailable ? exactTotal - exactAvailable : 0n;
}
function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}
function percent(used, total) {
  if (typeof used === "number" && typeof total === "number") {
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.max(0, Math.min(100, used / total * 100));
  }
  const exactUsed = exactUnsigned(used);
  const exactTotal = exactUnsigned(total);
  if (exactUsed === null || exactTotal === null || exactTotal === 0n) {
    return 0;
  }
  const boundedUsed = exactUsed > exactTotal ? exactTotal : exactUsed;
  const hundredths = (boundedUsed * 10000n + exactTotal / 2n) / exactTotal;
  return Number(hundredths) / 100;
}

// src/shared/lib/mutations.ts
function removeMutationFromCache(queryClient, mutationKey, variables) {
  const mutationCache = queryClient.getMutationCache();
  for (const mutation of mutationCache.findAll({ mutationKey, exact: true })) {
    if (variables !== void 0 && mutation.state.variables !== variables) continue;
    mutationCache.remove(mutation);
  }
}

// src/features/agent-activation/AgentActivationPage.tsx
function activationMutationKey(requestId) {
  return ["agent-activation", requestId];
}
var pairingStatusLabel = {
  waiting: "\u7B49\u5F85\u6FC0\u6D3B",
  expired: "\u5DF2\u8FC7\u671F",
  denied: "\u5DF2\u62D2\u7EDD",
  active: "\u5DF2\u6FC0\u6D3B"
};
function AgentActivationPage({ requestId }) {
  const queryClient = useQueryClient();
  const [activationCode, setActivationCode] = useState("");
  const code = activationCodeForSubmission(activationCode);
  const pairingQuery = useQuery({
    queryKey: agentActivationQueryKeys.agentActivation.pairingRequest(requestId ?? ""),
    queryFn: () => agentActivationApi.agentPairingRequest(requestId),
    enabled: Boolean(requestId),
    retry: false
  });
  const activationMutation = useMutation({
    mutationKey: activationMutationKey(requestId ?? ""),
    mutationFn: ({ requestId: submittedRequestId, activationCode: submittedCode }) => agentActivationApi.activateAgent(submittedRequestId, submittedCode),
    onSuccess: () => setActivationCode(""),
    onSettled: (_result, _error, variables) => {
      variables.activationCode = "";
      removeMutationFromCache(
        queryClient,
        activationMutationKey(variables.requestId),
        variables
      );
    }
  });
  const submit = (event) => {
    event.preventDefault();
    if (requestId && code) activationMutation.mutate({ requestId, activationCode: code });
  };
  if (activationMutation.data) {
    return /* @__PURE__ */ jsx("section", { className: "activation-screen", children: /* @__PURE__ */ jsxs("section", { className: "activation-card", "aria-labelledby": "agent-activation-title", children: [
      /* @__PURE__ */ jsxs("div", { className: "activation-heading success", children: [
        /* @__PURE__ */ jsx(CircleCheck, { size: 30, "aria-hidden": "true" }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h1", { id: "agent-activation-title", children: "host-m-agent \u6FC0\u6D3B\u6210\u529F" }),
          /* @__PURE__ */ jsx("p", { children: "\u6B64\u8BBE\u5907\u5DF2\u4E0E UnionC \u914D\u5BF9\uFF0C\u53EF\u4EE5\u5173\u95ED\u8FD9\u4E2A\u6D4F\u89C8\u5668\u7A97\u53E3\u3002" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("dl", { className: "activation-summary", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u5B9E\u4F8B ID" }),
          /* @__PURE__ */ jsx("dd", { className: "mono", children: activationMutation.data.instance_id })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("dt", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ jsx("dd", { children: "\u5DF2\u6FC0\u6D3B" })
        ] })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx("section", { className: "activation-screen", children: /* @__PURE__ */ jsxs("section", { className: "activation-card", "aria-labelledby": "agent-activation-title", children: [
    /* @__PURE__ */ jsxs("div", { className: "activation-heading", children: [
      /* @__PURE__ */ jsx(MonitorCog, { size: 30, "aria-hidden": "true" }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { id: "agent-activation-title", children: "\u6FC0\u6D3B host-m-agent" }),
        /* @__PURE__ */ jsx("p", { children: "CLI \u914D\u5BF9\u4F1A\u5728\u6B64\u9875\u9762\u786E\u8BA4\u4E00\u6B21\u6027\u6388\u6743\u5BC6\u94A5\uFF1BWindows \u53EF\u76F4\u63A5\u5728 host-m-agent \u672C\u5730\u914D\u7F6E\u9875\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\u548C\u6388\u6743\u5BC6\u94A5\u3002" })
      ] })
    ] }),
    requestId && pairingQuery.data ? /* @__PURE__ */ jsxs("dl", { className: "activation-summary", "aria-label": "host-m-agent \u914D\u5BF9\u6458\u8981", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u7CFB\u7EDF" }),
        /* @__PURE__ */ jsx("dd", { children: [pairingQuery.data.os, pairingQuery.data.arch].filter(Boolean).join(" \xB7 ") || "-" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "host-m-agent" }),
        /* @__PURE__ */ jsx("dd", { children: pairingQuery.data.agent_version || "-" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsx("dd", { children: pairingStatusLabel[pairingQuery.data.status] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u5230\u671F\u65F6\u95F4" }),
        /* @__PURE__ */ jsx("dd", { children: formatDateTime(pairingQuery.data.expires_at) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u914D\u5BF9\u8BF7\u6C42" }),
        /* @__PURE__ */ jsx("dd", { className: "mono", children: requestId })
      ] })
    ] }) : null,
    !requestId ? /* @__PURE__ */ jsx("div", { className: "activation-route-error", role: "alert", children: "\u6FC0\u6D3B\u94FE\u63A5\u65E0\u6548\u6216\u4E0D\u5B8C\u6574\u3002\u8BF7\u8FD4\u56DE host-m-agent \u91CD\u65B0\u53D1\u8D77\u6D4F\u89C8\u5668\u914D\u5BF9\u3002" }) : null,
    requestId && pairingQuery.isLoading ? /* @__PURE__ */ jsx(LoadingBlock, { label: "\u6B63\u5728\u8BFB\u53D6 host-m-agent \u914D\u5BF9\u4FE1\u606F" }) : null,
    requestId && pairingQuery.error ? /* @__PURE__ */ jsx(InlineNotice, { tone: "danger", text: pairingQuery.error.message }) : null,
    requestId && pairingQuery.data && !canActivatePairing(pairingQuery.data.status) ? /* @__PURE__ */ jsx(
      InlineNotice,
      {
        tone: pairingQuery.data.status === "active" ? "warn" : "danger",
        text: `\u6B64\u914D\u5BF9\u8BF7\u6C42${pairingStatusLabel[pairingQuery.data.status]}\uFF0C\u4E0D\u80FD\u518D\u6B21\u6FC0\u6D3B\u3002`
      }
    ) : null,
    requestId && pairingQuery.data && canActivatePairing(pairingQuery.data.status) ? /* @__PURE__ */ jsxs("form", { className: "activation-form", onSubmit: submit, children: [
      /* @__PURE__ */ jsxs("label", { htmlFor: "agent-activation-code", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx(KeyRound, { size: 16, "aria-hidden": "true" }),
          "\u4E00\u6B21\u6027\u6FC0\u6D3B\u7801"
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "agent-activation-code",
            value: activationCode,
            onChange: (event) => {
              setActivationCode(event.target.value);
              if (activationMutation.isError) activationMutation.reset();
            },
            autoComplete: "one-time-code",
            autoCapitalize: "none",
            spellCheck: false,
            maxLength: 128,
            placeholder: "\u8F93\u5165\u7BA1\u7406\u4E2D\u5FC3\u751F\u6210\u7684\u6FC0\u6D3B\u7801",
            autoFocus: true,
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsx(MutationError, { mutation: activationMutation }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          className: "action-button primary activation-submit",
          type: "submit",
          disabled: !code || activationMutation.isPending,
          children: [
            /* @__PURE__ */ jsx(KeyRound, { size: 16, "aria-hidden": "true" }),
            /* @__PURE__ */ jsx("span", { children: activationMutation.isPending ? "\u6B63\u5728\u6FC0\u6D3B\u2026" : "\u786E\u8BA4\u6FC0\u6D3B" })
          ]
        }
      )
    ] }) : null
  ] }) });
}

// src/shared/lib/adjacentPanel.ts
function adjacentPanelLayout({
  cardWidth,
  cardHeight,
  columnGap,
  rowGap,
  column,
  columnCount,
  top
}) {
  const panelColumns = Math.min(3, columnCount);
  const opensRight = column < Math.ceil(columnCount / 2);
  const requestedStart = opensRight ? column + 1 : column - panelColumns;
  const startColumn = Math.max(0, Math.min(requestedStart, columnCount - panelColumns));
  return {
    left: startColumn * (cardWidth + columnGap),
    top,
    width: panelColumns * cardWidth + (panelColumns - 1) * columnGap,
    height: 3 * cardHeight + 2 * rowGap,
    placement: opensRight ? "right" : "left"
  };
}

// src/shared/components/InlineEditableField.tsx
function InlineEditableField({
  value,
  label,
  validate,
  onSave,
  compact = false,
  displayValue,
  inputType = "text",
  normalize = (next) => next.trim(),
  cancelEmpty = false,
  maxLength,
  disabled = false
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const errorId = useId();
  const committingRef = useRef(false);
  const skipBlurRef = useRef(false);
  const cancel = () => {
    skipBlurRef.current = true;
    setDraft(value);
    setError("");
    setEditing(false);
  };
  const commit = async () => {
    if (committingRef.current) return;
    const next = normalize(draft);
    if (cancelEmpty && next.length === 0) {
      setDraft(value);
      setError("");
      setEditing(false);
      return;
    }
    const validationError = validate(next);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    committingRef.current = true;
    try {
      await onSave(next);
      setDraft(inputType === "password" ? value : next);
      setError("");
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "\u4FDD\u5B58\u5931\u8D25");
    } finally {
      committingRef.current = false;
    }
  };
  if (editing) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: `sunshine-inline-input${compact ? " compact" : ""}${error ? " input-error" : ""}`,
          value: draft,
          type: inputType,
          "aria-label": label,
          "aria-invalid": Boolean(error),
          "aria-errormessage": error ? errorId : void 0,
          title: error || void 0,
          maxLength,
          autoFocus: true,
          onClick: (event) => event.stopPropagation(),
          onChange: (event) => {
            setDraft(event.target.value);
            setError("");
          },
          onBlur: () => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false;
              return;
            }
            void commit();
          },
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }
        }
      ),
      error ? /* @__PURE__ */ jsx("span", { className: "sr-only", id: errorId, role: "alert", children: error }) : null
    ] });
  }
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      className: `sunshine-inline-editable${compact ? " compact" : ""}`,
      title: disabled ? "\u6B63\u5728\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u5019" : `\u4FEE\u6539${label}`,
      "aria-label": `\u4FEE\u6539${label}\uFF0C\u5F53\u524D\u503C\uFF1A${displayValue ?? value}`,
      disabled,
      onClick: (event) => {
        event.stopPropagation();
        if (disabled) return;
        skipBlurRef.current = false;
        setDraft(value);
        setEditing(true);
      },
      children: displayValue ?? value
    }
  );
}

// src/features/monitoring/queryKeys.ts
var monitoringQueryKeys = {
  monitoring: {
    hosts: ["monitoring-hosts"],
    hostPage: (limit, offset) => ["monitoring-hosts", limit, offset],
    host: (hostId) => ["monitoring-host", hostId],
    history: (hostId) => ["monitoring-history", hostId],
    agentInstances: ["monitoring-agent-instances"]
  }
};

// src/features/monitoring/components/AgentInstances.tsx
var createAgentMutationKey = ["monitoring-create-agent-instance"];
var MAX_EXPIRATION_TIMER_DELAY_MS = 2147e6;
function ActivationCodePanel({ created, onClose }) {
  const [copied, setCopied] = useState(false);
  return /* @__PURE__ */ jsxs("div", { className: "agent-created-instance", children: [
    /* @__PURE__ */ jsx(InlineNotice, { tone: "warn", text: agentAuthorizationKeyGuidance }),
    /* @__PURE__ */ jsxs("dl", { className: "agent-instance-details", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u72B6\u6001" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          /* @__PURE__ */ jsx(StatusLed, { tone: "warn" }),
          " \u5F85\u6FC0\u6D3B"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u540D\u79F0" }),
        /* @__PURE__ */ jsx("dd", { children: created.display_name })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u4E00\u6B21\u6027\u6388\u6743\u5BC6\u94A5" }),
        /* @__PURE__ */ jsx("dd", { className: "agent-activation-code", children: created.activation_code })
      ] }),
      created.instance_id ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u5B9E\u4F8B ID" }),
        /* @__PURE__ */ jsx("dd", { className: "mono", children: created.instance_id })
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "\u5230\u671F\u65F6\u95F4" }),
        /* @__PURE__ */ jsx("dd", { children: formatDateTime(created.expires_at) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "button-row", children: [
      /* @__PURE__ */ jsx(
        ActionButton,
        {
          icon: Copy,
          label: copied ? "\u5DF2\u590D\u5236\u6388\u6743\u5BC6\u94A5" : "\u590D\u5236\u6388\u6743\u5BC6\u94A5",
          onClick: () => {
            void navigator.clipboard.writeText(created.activation_code).then(() => setCopied(true)).catch(() => setCopied(false));
          }
        }
      ),
      /* @__PURE__ */ jsx(ActionButton, { icon: X, label: "\u53D6\u6D88\u9080\u8BF7\u5E76\u6E05\u9664\u6388\u6743\u5BC6\u94A5", onClick: onClose })
    ] })
  ] });
}
function HostRegistration({
  host,
  selected = false,
  canManage = false,
  onOpenDetails = () => void 0,
  onDeleted
}) {
  const queryClient = useQueryClient();
  const remarkMutation = useMutation({
    mutationFn: (remark) => monitoringApi.monitoringUpdateRemark(host.id, remark),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.monitoring.hosts }),
        queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.monitoring.host(host.id) })
      ]);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: () => monitoringApi.monitoringDeleteHost(host.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: monitoringQueryKeys.monitoring.host(host.id), exact: true });
      queryClient.removeQueries({ queryKey: monitoringQueryKeys.monitoring.history(host.id), exact: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.monitoring.hosts }),
        queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.monitoring.agentInstances })
      ]);
      onDeleted?.();
    }
  });
  const status = statusMeta(host.status);
  const controlsBusy = remarkMutation.isPending || deleteMutation.isPending;
  const managementDisabled = controlsBusy || !canManage;
  return /* @__PURE__ */ jsxs("div", { className: "monitoring-host-entry", children: [
    /* @__PURE__ */ jsx(
      "article",
      {
        className: "sarmg-card monitoring-host-card",
        "aria-label": `${host.name}\uFF0C${status.label}`,
        "aria-busy": controlsBusy,
        "aria-current": selected ? "true" : void 0,
        "data-detail-open": selected ? "true" : void 0,
        children: /* @__PURE__ */ jsxs(CardInner, { children: [
          /* @__PURE__ */ jsxs(CardRow, { label: "\u540D\u79F0", children: [
            /* @__PURE__ */ jsx(
              InlineEditableField,
              {
                label: "\u540D\u79F0",
                value: host.name,
                validate: (value) => value && value.length <= 255 ? null : "\u540D\u79F0\u5FC5\u987B\u4E3A 1\u2013255 \u4E2A\u5B57\u7B26",
                onSave: (remark) => remarkMutation.mutateAsync(remark).then(() => void 0),
                maxLength: 255,
                disabled: managementDisabled
              }
            ),
            /* @__PURE__ */ jsx("span", { title: status.label, children: /* @__PURE__ */ jsx(StatusLed, { tone: status.tone }) })
          ] }),
          /* @__PURE__ */ jsx(CardRow, { label: "\u72B6\u6001", children: status.label }),
          /* @__PURE__ */ jsx(CardRow, { label: "\u7CFB\u7EDF", children: /* @__PURE__ */ jsx(TruncatedText, { children: [host.os, host.arch].filter(Boolean).join(" \xB7 ") }) }),
          /* @__PURE__ */ jsxs(CardActions, { children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sarmg-card__action",
                type: "button",
                disabled: controlsBusy,
                onClick: (event) => onOpenDetails(event.currentTarget),
                children: [
                  /* @__PURE__ */ jsx(Info, { size: 12 }),
                  /* @__PURE__ */ jsx("span", { children: selected ? "\u6536\u8D77\u8BE6\u60C5" : "\u8BE6\u60C5" })
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                className: "sarmg-card__action sarmg-action-danger",
                type: "button",
                disabled: managementDisabled,
                onClick: (event) => {
                  event.stopPropagation();
                  if (window.confirm(
                    `\u6C38\u4E45\u5220\u9664\u4E3B\u673A "${host.name}"\uFF1F

\u6B64\u64CD\u4F5C\u4F1A\u5220\u9664\u8BE5\u5B9E\u4F8B\u7684\u5168\u90E8\u5386\u53F2\u3001\u51ED\u636E\u548C\u9080\u8BF7\uFF0C\u65E0\u6CD5\u64A4\u9500\u3002`
                  )) deleteMutation.mutate();
                },
                children: [
                  /* @__PURE__ */ jsx(Trash2, { size: 12 }),
                  /* @__PURE__ */ jsx("span", { children: "\u5220\u9664" })
                ]
              }
            )
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsx(MutationError, { mutation: remarkMutation }),
    /* @__PURE__ */ jsx(MutationError, { mutation: deleteMutation })
  ] });
}
function AgentInstances({
  activeHostIds,
  addTrigger = 0,
  onAddTriggerHandled,
  canManage = false
}) {
  const queryClient = useQueryClient();
  const handledAddTriggerRef = useRef(0);
  const [created, setCreated] = useState(null);
  const [creationOutcome, setCreationOutcome] = useState(null);
  const instancesQuery = useQuery({
    queryKey: monitoringQueryKeys.monitoring.agentInstances,
    queryFn: ({ signal }) => monitoringApi.monitoringAgentInstances(signal),
    refetchInterval: 1e4,
    enabled: Boolean(created)
  });
  const createMutation = useMutation({
    mutationKey: createAgentMutationKey,
    mutationFn: () => monitoringApi.monitoringCreateAgentInstance("\u6982\u89C8", 15),
    onSuccess: async (result) => {
      setCreationOutcome(null);
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: monitoringQueryKeys.monitoring.agentInstances });
    }
  });
  const resetCreateMutation = createMutation.reset;
  const clearCreated = useCallback(() => {
    setCreated(null);
    resetCreateMutation();
    removeMutationFromCache(queryClient, createAgentMutationKey);
  }, [queryClient, resetCreateMutation]);
  const finishCreated = useCallback((instance, status) => {
    setCreationOutcome({ displayName: instance.display_name, status });
    clearCreated();
  }, [clearCreated]);
  useEffect(() => () => {
    removeMutationFromCache(queryClient, createAgentMutationKey);
  }, [queryClient]);
  const cancelMutation = useMutation({
    mutationFn: (requestId) => monitoringApi.monitoringCancelAgentInstance(requestId),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: monitoringQueryKeys.monitoring.agentInstances
    })
  });
  const createAgent = createMutation.mutate;
  const creationPending = createMutation.isPending;
  useEffect(() => {
    if (addTrigger <= handledAddTriggerRef.current) return;
    if (!canManage) {
      handledAddTriggerRef.current = addTrigger;
      onAddTriggerHandled?.(addTrigger);
      return;
    }
    if (created || creationPending) return;
    handledAddTriggerRef.current = addTrigger;
    onAddTriggerHandled?.(addTrigger);
    createAgent();
  }, [addTrigger, canManage, createAgent, created, creationPending, onAddTriggerHandled]);
  const refreshedCreated = created ? instancesQuery.data?.find((instance) => instance.request_id === created.request_id) : void 0;
  const createdStatus = created?.instance_id && activeHostIds.has(created.instance_id) ? "active" : refreshedCreated?.status ?? created?.status;
  useEffect(() => {
    if (!created || createdStatus !== "pending") return;
    const expiresAt = Date.parse(created.expires_at);
    if (!Number.isFinite(expiresAt)) {
      finishCreated(created, "expired");
      return;
    }
    let timeoutId;
    let cancelled = false;
    const expireWhenDue = () => {
      if (cancelled) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        finishCreated(created, "expired");
        return;
      }
      timeoutId = window.setTimeout(
        expireWhenDue,
        Math.min(remaining, MAX_EXPIRATION_TIMER_DELAY_MS)
      );
    };
    expireWhenDue();
    return () => {
      cancelled = true;
      if (timeoutId !== void 0) window.clearTimeout(timeoutId);
    };
  }, [created, createdStatus, finishCreated]);
  useEffect(() => {
    if (!created || !createdStatus || createdStatus === "pending") return;
    finishCreated(created, createdStatus);
  }, [created, createdStatus, finishCreated]);
  const cancelCreated = () => {
    const requestId = created?.request_id;
    clearCreated();
    if (requestId) cancelMutation.mutate(requestId);
  };
  const visible = createMutation.isPending || createMutation.isError || cancelMutation.isPending || cancelMutation.isError || Boolean(created) || Boolean(creationOutcome);
  if (!visible) return null;
  return /* @__PURE__ */ jsxs("section", { className: "section-band agent-instances", "aria-live": "polite", children: [
    createMutation.isPending ? /* @__PURE__ */ jsx(InlineNotice, { tone: "warn", text: "\u6B63\u5728\u521B\u5EFA host-m-agent \u9080\u8BF7\u2026" }) : null,
    cancelMutation.isPending ? /* @__PURE__ */ jsx(InlineNotice, { tone: "warn", text: "\u6B63\u5728\u53D6\u6D88 host-m-agent \u9080\u8BF7\u2026" }) : null,
    /* @__PURE__ */ jsx(MutationError, { mutation: createMutation }),
    /* @__PURE__ */ jsx(MutationError, { mutation: cancelMutation }),
    cancelMutation.isError && cancelMutation.variables ? /* @__PURE__ */ jsx(
      ActionButton,
      {
        icon: X,
        label: "\u91CD\u8BD5\u53D6\u6D88\u9080\u8BF7",
        onClick: () => cancelMutation.mutate(cancelMutation.variables)
      }
    ) : null,
    created && createdStatus === "pending" ? /* @__PURE__ */ jsx(ActivationCodePanel, { created, onClose: cancelCreated }) : null,
    creationOutcome?.status === "active" ? /* @__PURE__ */ jsxs("div", { className: "agent-instance-activated", role: "status", children: [
      /* @__PURE__ */ jsx(ShieldCheck, { size: 18, "aria-hidden": "true" }),
      /* @__PURE__ */ jsxs("span", { children: [
        creationOutcome.displayName,
        " \u5DF2\u6FC0\u6D3B\uFF0C\u5E76\u5DF2\u52A0\u5165\u4E3B\u673A\u5217\u8868\u3002"
      ] }),
      /* @__PURE__ */ jsx(ActionButton, { icon: X, label: "\u5173\u95ED", onClick: () => setCreationOutcome(null) })
    ] }) : null,
    creationOutcome && creationOutcome.status !== "active" ? /* @__PURE__ */ jsx(InlineNotice, { tone: "warn", text: `\u914D\u5BF9\u9080\u8BF7\u5DF2${creationOutcome.status === "expired" ? "\u8FC7\u671F" : "\u53D6\u6D88"}\uFF0C\u6388\u6743\u5BC6\u94A5\u5DF2\u4ECE\u5185\u5B58\u548C\u9875\u9762\u6E05\u9664\u3002` }) : null
  ] });
}

// src/features/monitoring/components/HistoryMetrics.tsx
function HistoryMetrics({ points }) {
  const cpu = historyValues(points, (point) => point.cpu_usage_percent);
  const memory = historyValues(points, (point) => point.memory_usage_percent);
  const gpu = historyValues(points, (point) => point.gpu_utilization_percent);
  const temperature = historyValues(points, (point) => point.max_temperature_celsius);
  const network = historyValues(points, (point) => sumNullable(
    point.network_received_bytes_per_second,
    point.network_transmitted_bytes_per_second
  ));
  const disk = historyValues(points, (point) => sumNullable(
    point.disk_read_bytes_per_second,
    point.disk_written_bytes_per_second
  ));
  const detail = points.length ? `${points.length} \u4E2A\u91C7\u6837\u70B9` : NA;
  return /* @__PURE__ */ jsxs("div", { className: "sarmg-grid metric-grid", children: [
    /* @__PURE__ */ jsx(Metric, { label: "CPU", value: formatPercent(latestHistoryValue(cpu)), detail, tone: metricTone(latestHistoryValue(cpu)), sparkData: cpu, sparkMax: 100 }),
    /* @__PURE__ */ jsx(Metric, { label: "\u5185\u5B58", value: formatPercent(latestHistoryValue(memory)), detail, tone: metricTone(latestHistoryValue(memory)), sparkData: memory, sparkMax: 100, sparkColor: "var(--warn)" }),
    /* @__PURE__ */ jsx(Metric, { label: "GPU", value: formatPercent(latestHistoryValue(gpu)), detail, tone: metricTone(latestHistoryValue(gpu)), sparkData: gpu, sparkMax: 100, sparkColor: "var(--accent)" }),
    /* @__PURE__ */ jsx(Metric, { label: "\u7F51\u7EDC", value: formatMetric(latestHistoryValue(network), formatBytesPerSecond), detail, tone: "neutral", sparkData: network, sparkColor: "var(--good)" }),
    /* @__PURE__ */ jsx(Metric, { label: "\u78C1\u76D8 I/O", value: formatMetric(latestHistoryValue(disk), formatBytesPerSecond), detail, tone: "neutral", sparkData: disk }),
    /* @__PURE__ */ jsx(Metric, { label: "\u6E29\u5EA6", value: formatTemperature(latestHistoryValue(temperature)), detail, tone: metricTone(latestHistoryValue(temperature), 80), sparkData: temperature, sparkColor: "var(--danger)" })
  ] });
}

// src/shared/lib/tabs.ts
var TAB_NAVIGATION_KEYS = /* @__PURE__ */ new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
function activateTabFromKeyboard(event, tabs, currentIndex, activate2) {
  if (!TAB_NAVIGATION_KEYS.has(event.key) || tabs.length === 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  activate2(tabs[nextIndex]);
  const tabElements = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]');
  tabElements?.[nextIndex]?.focus();
}

// src/features/monitoring/components/HardwareDetails.tsx
var DETAIL_SECTIONS = [
  { key: "overview", label: "\u6982\u89C8", Icon: Activity },
  { key: "network", label: "\u7F51\u7EDC", Icon: Network },
  { key: "storage", label: "\u78C1\u76D8", Icon: HardDrive },
  { key: "gpu", label: "GPU", Icon: CircuitBoard },
  { key: "temperature", label: "\u6E29\u5EA6", Icon: Thermometer },
  { key: "capabilities", label: "\u80FD\u529B", Icon: ShieldCheck },
  { key: "history", label: "\u5386\u53F2", Icon: Gauge }
];
function DetailTable({
  title,
  columns,
  rows,
  emptyLabel = "\u6682\u65E0\u6570\u636E"
}) {
  return /* @__PURE__ */ jsxs("section", { className: "monitoring-table-section", children: [
    /* @__PURE__ */ jsx("h3", { children: title }),
    /* @__PURE__ */ jsx("div", { className: "monitoring-table-scroll", children: /* @__PURE__ */ jsxs("table", { className: "monitoring-detail-table", "aria-label": title, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: columns.map((column) => /* @__PURE__ */ jsx("th", { scope: "col", children: column }, column)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.length ? rows.map((row, rowIndex) => /* @__PURE__ */ jsx("tr", { children: row.map((cell, cellIndex) => /* @__PURE__ */ jsx("td", { children: cell }, cellIndex)) }, rowIndex)) : /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { className: "monitoring-table-empty", colSpan: columns.length, children: emptyLabel }) }) })
    ] }) })
  ] });
}
function OverviewTables({
  host,
  report
}) {
  const memory = report?.system.memory;
  const network = sumNullable(
    host.network_received_bytes_per_second,
    host.network_transmitted_bytes_per_second
  );
  const disk = sumNullable(
    host.disk_read_bytes_per_second,
    host.disk_written_bytes_per_second
  );
  return /* @__PURE__ */ jsxs("div", { className: "monitoring-table-stack", children: [
    /* @__PURE__ */ jsx(
      DetailTable,
      {
        title: "\u5B9E\u4F8B\u4FE1\u606F",
        columns: ["\u5B57\u6BB5", "\u503C"],
        rows: [
          ["\u540D\u79F0", host.name || NA],
          ["\u72B6\u6001", statusMeta(host.status).label],
          ["\u5B9E\u4F8B ID", /* @__PURE__ */ jsx("span", { className: "mono", children: host.id })],
          ["\u64CD\u4F5C\u7CFB\u7EDF", [host.os, host.os_version].filter(Boolean).join(" ") || NA],
          ["\u5185\u6838", host.kernel_version || NA],
          ["\u67B6\u6784", host.arch || NA],
          ["host-m-agent \u7248\u672C", host.agent_version || NA],
          ["\u6CE8\u518C\u65F6\u95F4", formatDateTime(host.registered_at)],
          ["\u6700\u540E\u4E0A\u62A5", formatDateTime(host.last_seen_at)],
          ["\u6700\u540E\u91C7\u6837", host.latest_collected_at ? formatDateTime(host.latest_collected_at) : NA]
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      DetailTable,
      {
        title: "\u5B9E\u65F6\u6307\u6807",
        columns: ["\u9879\u76EE", "\u5F53\u524D\u503C", "\u8BF4\u660E"],
        rows: [
          [
            "CPU",
            formatPercent(host.cpu_usage_percent),
            report ? `${report.system.cpu.logical_count} \u4E2A\u903B\u8F91\u6838\u5FC3${report.system.cpu.physical_count ? ` \xB7 ${report.system.cpu.physical_count} \u4E2A\u7269\u7406\u6838\u5FC3` : ""}` : NA
          ],
          [
            "\u5185\u5B58",
            formatPercent(host.memory_usage_percent),
            memory ? `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}` : NA
          ],
          [
            "GPU",
            formatPercent(host.gpu_utilization_percent),
            isNumber(host.gpu_memory_usage_percent) ? `\u663E\u5B58 ${formatPercent(host.gpu_memory_usage_percent)}` : NA
          ],
          [
            "\u7F51\u7EDC",
            formatMetric(network, formatBytesPerSecond),
            `\u6536 ${formatMetric(host.network_received_bytes_per_second, formatBytesPerSecond)} \xB7 \u53D1 ${formatMetric(host.network_transmitted_bytes_per_second, formatBytesPerSecond)}`
          ],
          [
            "\u78C1\u76D8 I/O",
            formatMetric(disk, formatBytesPerSecond),
            `\u8BFB ${formatMetric(host.disk_read_bytes_per_second, formatBytesPerSecond)} \xB7 \u5199 ${formatMetric(host.disk_written_bytes_per_second, formatBytesPerSecond)}`
          ],
          ["\u6700\u9AD8\u6E29\u5EA6", formatTemperature(host.max_temperature_celsius), "\u5F53\u524D\u53EF\u7528\u4F20\u611F\u5668\u4E2D\u7684\u6700\u9AD8\u503C"]
        ]
      }
    )
  ] });
}
function NetworkTable({ report }) {
  return /* @__PURE__ */ jsx(
    DetailTable,
    {
      title: "\u7F51\u7EDC\u63A5\u53E3",
      columns: ["\u63A5\u53E3", "\u63A5\u6536\u901F\u7387", "\u53D1\u9001\u901F\u7387", "\u7D2F\u8BA1\u63A5\u6536", "\u7D2F\u8BA1\u53D1\u9001", "\u6536\u5305", "\u53D1\u5305", "\u9519\u8BEF"],
      rows: (report?.system.networks ?? []).map((network) => [
        network.name || NA,
        formatBytesPerSecond(network.received_bytes_per_second),
        formatBytesPerSecond(network.transmitted_bytes_per_second),
        formatBytes(network.received_bytes_total),
        formatBytes(network.transmitted_bytes_total),
        formatInteger(network.packets_received_total),
        formatInteger(network.packets_transmitted_total),
        formatInteger(addJsonU64(network.receive_errors_total, network.transmit_errors_total))
      ]),
      emptyLabel: "\u6682\u65E0\u7F51\u7EDC\u63A5\u53E3\u6570\u636E"
    }
  );
}
function StorageTable({ report }) {
  return /* @__PURE__ */ jsx(
    DetailTable,
    {
      title: "\u78C1\u76D8\u4E0E\u6587\u4EF6\u7CFB\u7EDF",
      columns: ["\u8BBE\u5907", "\u6302\u8F7D\u70B9", "\u6587\u4EF6\u7CFB\u7EDF", "\u5DF2\u7528 / \u603B\u91CF", "\u5360\u7528\u7387", "\u8BFB\u53D6", "\u5199\u5165", "\u6A21\u5F0F"],
      rows: (report?.system.disks ?? []).map((disk) => {
        const used = subtractJsonU64(disk.total_bytes, disk.available_bytes);
        return [
          disk.name || NA,
          disk.mount_point || NA,
          disk.file_system || NA,
          `${formatBytes(used)} / ${formatBytes(disk.total_bytes)}`,
          formatPercent(percent(used, disk.total_bytes)),
          formatBytesPerSecond(disk.read_bytes_per_second),
          formatBytesPerSecond(disk.written_bytes_per_second),
          disk.is_read_only ? "\u53EA\u8BFB" : "\u8BFB\u5199"
        ];
      }),
      emptyLabel: "\u6682\u65E0\u78C1\u76D8\u6570\u636E"
    }
  );
}
function gpuMemory(gpu) {
  return gpu.memory_used_bytes !== null && gpu.memory_total_bytes !== null ? `${formatBytes(gpu.memory_used_bytes)} / ${formatBytes(gpu.memory_total_bytes)}\uFF08${formatPercent(percent(gpu.memory_used_bytes, gpu.memory_total_bytes))}\uFF09` : NA;
}
function GpuTable({ report }) {
  return /* @__PURE__ */ jsx(
    DetailTable,
    {
      title: "GPU",
      columns: ["\u540D\u79F0", "\u5382\u5546", "\u5360\u7528", "\u663E\u5B58", "\u6E29\u5EA6", "\u529F\u8017", "\u6838\u5FC3\u9891\u7387", "\u663E\u5B58\u9891\u7387", "PCIe \u6536 / \u53D1"],
      rows: (report?.system.gpus ?? []).map((gpu) => [
        gpu.name || gpu.id || NA,
        gpu.vendor || NA,
        formatPercent(gpu.utilization_percent),
        gpuMemory(gpu),
        formatTemperature(gpu.temperature_celsius),
        formatMetric(gpu.power_watts, (value) => `${value.toFixed(1)} W`),
        formatMetric(gpu.core_clock_mhz, (value) => `${value.toFixed(0)} MHz`),
        formatMetric(gpu.memory_clock_mhz, (value) => `${value.toFixed(0)} MHz`),
        `${formatMetric(gpu.pcie_rx_bytes_per_second, formatBytesPerSecond)} / ${formatMetric(gpu.pcie_tx_bytes_per_second, formatBytesPerSecond)}`
      ]),
      emptyLabel: "\u6682\u65E0 GPU \u6570\u636E"
    }
  );
}
function TemperatureTable({ report }) {
  return /* @__PURE__ */ jsx(
    DetailTable,
    {
      title: "\u6E29\u5EA6\u4F20\u611F\u5668",
      columns: ["\u4F20\u611F\u5668", "\u5F53\u524D", "\u4E0A\u9650", "\u4E34\u754C", "\u6765\u6E90"],
      rows: (report?.system.temperatures ?? []).map((sensor) => [
        sensor.label || sensor.id || NA,
        formatTemperature(sensor.celsius),
        formatTemperature(sensor.max_celsius),
        formatTemperature(sensor.critical_celsius),
        sensor.source || NA
      ]),
      emptyLabel: "\u6682\u65E0\u6E29\u5EA6\u4F20\u611F\u5668\u6570\u636E"
    }
  );
}
function CapabilityTable({ capabilities }) {
  return /* @__PURE__ */ jsx(
    DetailTable,
    {
      title: "\u91C7\u96C6\u80FD\u529B",
      columns: ["\u80FD\u529B", "\u72B6\u6001", "\u6765\u6E90", "\u9519\u8BEF\u7C7B\u578B", "\u8BF4\u660E"],
      rows: capabilities.map((capability) => [
        capability.name || NA,
        /* @__PURE__ */ jsxs("span", { className: "monitoring-capability-status", children: [
          /* @__PURE__ */ jsx(StatusLed, { tone: capability.available ? "good" : "danger" }),
          capability.available ? "\u652F\u6301" : "\u4E0D\u53EF\u7528"
        ] }),
        capability.source || NA,
        capability.error_kind || NA,
        capability.message || NA
      ]),
      emptyLabel: "\u6682\u65E0\u91C7\u96C6\u80FD\u529B\u6570\u636E"
    }
  );
}
function MonitoringHostPanel({
  host,
  report,
  historyPoints,
  detailLoading,
  detailError,
  historyLoading,
  historyError,
  onClose
}) {
  const [section, setSection] = useState("overview");
  const tabsId = useId();
  return /* @__PURE__ */ jsxs("div", { className: "sunshine-host-panel monitoring-host-panel", children: [
    /* @__PURE__ */ jsxs("div", { className: "sunshine-panel-nav-row", children: [
      /* @__PURE__ */ jsx("nav", { className: "sunshine-subnav-inline", role: "tablist", "aria-label": `${host.name} \u8BE6\u60C5\u5206\u7C7B`, children: DETAIL_SECTIONS.map(({ key, label, Icon: Icon2 }, index) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          id: `${tabsId}-tab-${key}`,
          role: "tab",
          "aria-selected": section === key,
          "aria-controls": `${tabsId}-panel-${key}`,
          tabIndex: section === key ? 0 : -1,
          className: section === key ? "sunshine-section-tab active" : "sunshine-section-tab",
          onClick: () => setSection(key),
          onKeyDown: (event) => activateTabFromKeyboard(
            event,
            DETAIL_SECTIONS,
            index,
            (next) => setSection(next.key)
          ),
          children: [
            /* @__PURE__ */ jsx(Icon2, { size: 18 }),
            /* @__PURE__ */ jsx("strong", { children: label })
          ]
        },
        key
      )) }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          className: "icon-button sunshine-panel-close",
          "aria-label": "\u5173\u95ED\u8BE6\u60C5\u9762\u677F",
          title: "\u5173\u95ED",
          autoFocus: true,
          onClick: onClose,
          children: /* @__PURE__ */ jsx(X, { size: 18, "aria-hidden": "true" })
        }
      )
    ] }),
    DETAIL_SECTIONS.map(({ key }) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: "monitoring-detail-tabpanel",
        role: "tabpanel",
        id: `${tabsId}-panel-${key}`,
        "aria-labelledby": `${tabsId}-tab-${key}`,
        hidden: section !== key,
        children: [
          section === key && key !== "history" && detailLoading ? /* @__PURE__ */ jsx(LoadingBlock, { label: "\u6B63\u5728\u8BFB\u53D6\u4E3B\u673A\u8BE6\u60C5" }) : null,
          section === key && key !== "history" && detailError ? /* @__PURE__ */ jsx(InlineNotice, { tone: "danger", text: detailError.message }) : null,
          section === "overview" && key === "overview" ? /* @__PURE__ */ jsx(OverviewTables, { host, report }) : null,
          section === "network" && key === "network" ? /* @__PURE__ */ jsx(NetworkTable, { report }) : null,
          section === "storage" && key === "storage" ? /* @__PURE__ */ jsx(StorageTable, { report }) : null,
          section === "gpu" && key === "gpu" ? /* @__PURE__ */ jsx(GpuTable, { report }) : null,
          section === "temperature" && key === "temperature" ? /* @__PURE__ */ jsx(TemperatureTable, { report }) : null,
          section === "capabilities" && key === "capabilities" ? /* @__PURE__ */ jsx(CapabilityTable, { capabilities: report?.capabilities ?? host.capabilities }) : null,
          section === "history" && key === "history" ? /* @__PURE__ */ jsxs("section", { className: "monitoring-history-panel", children: [
            historyLoading ? /* @__PURE__ */ jsx(LoadingBlock, { label: "\u6B63\u5728\u8BFB\u53D6\u5386\u53F2\u6307\u6807" }) : null,
            historyError ? /* @__PURE__ */ jsx(InlineNotice, { tone: "danger", text: historyError.message }) : null,
            /* @__PURE__ */ jsx(HistoryMetrics, { points: historyPoints })
          ] }) : null
        ]
      },
      key
    ))
  ] });
}

// src/features/monitoring/MonitoringView.tsx
var HOST_PAGE_SIZE = 20;
function MonitoringView({
  addTrigger = 0,
  onAddTriggerHandled,
  canManageAgents = false
}) {
  const [offset, setOffset] = useState(0);
  const [openHostId, setOpenHostId] = useState(null);
  const hostGridRef = useRef(null);
  const detailPanelRef = useRef(null);
  const detailPanelOpenerRef = useRef(null);
  const restoreDetailFocusRef = useRef(false);
  const hostsQuery = useQuery({
    queryKey: monitoringQueryKeys.monitoring.hostPage(HOST_PAGE_SIZE, offset),
    queryFn: () => monitoringApi.monitoringHosts(HOST_PAGE_SIZE, offset),
    refetchInterval: 1e4
  });
  const hosts = useMemo(() => hostsQuery.data?.hosts ?? [], [hostsQuery.data?.hosts]);
  const activeHostIds = useMemo(
    () => new Set(hosts.map((host) => host.id)),
    [hosts]
  );
  const total = hostsQuery.data?.total ?? 0;
  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + hosts.length < total;
  useEffect(() => {
    if (total > 0 && offset >= total) {
      setOffset(Math.floor((total - 1) / HOST_PAGE_SIZE) * HOST_PAGE_SIZE);
      setOpenHostId(null);
    }
  }, [offset, total]);
  const selectedSummary = hosts.find((host) => host.id === openHostId) ?? null;
  const selectedHostId = selectedSummary?.id ?? null;
  const detailQuery = useQuery({
    queryKey: monitoringQueryKeys.monitoring.host(selectedHostId ?? ""),
    queryFn: () => monitoringApi.monitoringHost(selectedHostId),
    enabled: Boolean(selectedHostId),
    refetchInterval: 1e4
  });
  const historyQuery = useQuery({
    queryKey: monitoringQueryKeys.monitoring.history(selectedHostId ?? ""),
    queryFn: () => monitoringApi.monitoringHistory(selectedHostId),
    enabled: Boolean(selectedHostId),
    refetchInterval: 3e4
  });
  const selectedHost = detailQuery.data?.host ?? selectedSummary;
  const latest = detailQuery.data?.latest;
  const historyPoints = useMemo(
    () => [...historyQuery.data?.points ?? []].sort((left, right) => left.collected_at.localeCompare(right.collected_at)),
    [historyQuery.data]
  );
  const closeDetailPanel = useCallback(() => {
    restoreDetailFocusRef.current = true;
    setOpenHostId(null);
  }, []);
  useEffect(() => {
    if (!selectedHost) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeDetailPanel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeDetailPanel, selectedHost]);
  useLayoutEffect(() => {
    if (selectedHost || !restoreDetailFocusRef.current) return;
    restoreDetailFocusRef.current = false;
    const opener = detailPanelOpenerRef.current;
    detailPanelOpenerRef.current = null;
    if (opener?.isConnected && !opener.disabled) opener.focus();
  }, [selectedHost]);
  useLayoutEffect(() => {
    if (!selectedHost) return;
    const grid = hostGridRef.current;
    const panel = detailPanelRef.current;
    const selectedCard = grid?.querySelector('[data-detail-open="true"]');
    if (!grid || !panel || !selectedCard) return;
    const updatePosition = () => {
      const cards = Array.from(grid.querySelectorAll(".monitoring-host-card"));
      const selectedIndex = cards.indexOf(selectedCard);
      if (selectedIndex < 0) return;
      const gridStyle = window.getComputedStyle(grid);
      const columnCount = Math.max(
        1,
        gridStyle.gridTemplateColumns.split(/\s+/).filter(Boolean).length
      );
      const cardRect = selectedCard.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const layout = adjacentPanelLayout({
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        columnGap: Number.parseFloat(gridStyle.columnGap) || 0,
        rowGap: Number.parseFloat(gridStyle.rowGap) || 0,
        column: selectedIndex % columnCount,
        columnCount,
        top: cardRect.top - gridRect.top
      });
      panel.style.left = `${layout.left}px`;
      panel.style.top = `${layout.top}px`;
      panel.style.width = `${layout.width}px`;
      panel.style.height = `${layout.height}px`;
      panel.style.borderRadius = `${cardRect.width / 18}px / ${cardRect.height / 12}px`;
      panel.dataset.placement = layout.placement;
      panel.style.visibility = "visible";
    };
    updatePosition();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(grid);
    resizeObserver.observe(selectedCard);
    return () => resizeObserver.disconnect();
  }, [selectedHost]);
  const changePage = (nextOffset) => {
    setOpenHostId(null);
    setOffset(nextOffset);
  };
  return /* @__PURE__ */ jsxs("section", { className: "view-stack monitoring-view", children: [
    /* @__PURE__ */ jsx(
      AgentInstances,
      {
        activeHostIds,
        addTrigger,
        onAddTriggerHandled,
        canManage: canManageAgents
      }
    ),
    /* @__PURE__ */ jsxs("section", { className: "section-band", children: [
      /* @__PURE__ */ jsx(SectionHeader, { icon: MonitorDot, title: "\u4E3B\u673A\u76D1\u63A7" }),
      hostsQuery.isLoading ? /* @__PURE__ */ jsx(LoadingBlock, { label: "\u6B63\u5728\u8BFB\u53D6\u4E3B\u673A\u72B6\u6001" }) : null,
      hostsQuery.error ? /* @__PURE__ */ jsx(InlineNotice, { tone: "danger", text: hostsQuery.error.message }) : null,
      total > HOST_PAGE_SIZE ? /* @__PURE__ */ jsxs("div", { className: "button-row", "aria-label": "\u76D1\u63A7\u4E3B\u673A\u5206\u9875", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "sarmg-card__action",
            type: "button",
            disabled: !hasPreviousPage,
            onClick: () => changePage(Math.max(0, offset - HOST_PAGE_SIZE)),
            children: "\u4E0A\u4E00\u9875"
          }
        ),
        /* @__PURE__ */ jsxs("span", { className: "muted-inline", children: [
          offset + 1,
          "\u2013",
          Math.min(offset + hosts.length, total),
          " / ",
          total
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "sarmg-card__action",
            type: "button",
            disabled: !hasNextPage,
            onClick: () => changePage(offset + HOST_PAGE_SIZE),
            children: "\u4E0B\u4E00\u9875"
          }
        )
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { className: "monitoring-master-detail", children: [
        /* @__PURE__ */ jsx("div", { className: "sarmg-grid monitoring-host-grid", ref: hostGridRef, children: hosts.map((host) => /* @__PURE__ */ jsx(
          HostRegistration,
          {
            host,
            selected: host.id === selectedHostId,
            canManage: canManageAgents,
            onOpenDetails: (trigger) => {
              if (openHostId === host.id) {
                closeDetailPanel();
                return;
              }
              detailPanelOpenerRef.current = trigger;
              restoreDetailFocusRef.current = false;
              setOpenHostId(host.id);
            },
            onDeleted: () => {
              if (openHostId === host.id) setOpenHostId(null);
            }
          },
          host.id
        )) }),
        selectedHost ? /* @__PURE__ */ jsx(
          "aside",
          {
            ref: detailPanelRef,
            className: "sunshine-adj-panel monitoring-adj-panel",
            role: "dialog",
            "aria-label": `${selectedHost.name} \u8BE6\u60C5\u9762\u677F`,
            children: /* @__PURE__ */ jsx(
              MonitoringHostPanel,
              {
                host: selectedHost,
                report: latest,
                historyPoints,
                detailLoading: detailQuery.isLoading,
                detailError: detailQuery.error,
                historyLoading: historyQuery.isLoading,
                historyError: historyQuery.error,
                onClose: closeDetailPanel
              },
              selectedHost.id
            )
          }
        ) : null
      ] })
    ] })
  ] });
}

// src/app.tsx
function activate() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5e3 },
      mutations: { retry: false }
    }
  });
  function HostMonitoringView(props) {
    return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsx(
      MonitoringView,
      {
        addTrigger: props.actionRequest,
        onAddTriggerHandled: props.onActionRequestHandled,
        canManageAgents: props.hasPermission("host-monitoring.agents.write")
      }
    ) });
  }
  function HostActivationView(props) {
    return /* @__PURE__ */ jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsx(AgentActivationPage, { requestId: props.location.params.requestId ?? null }) });
  }
  return {
    components: { HostMonitoringView, HostActivationView },
    primaryActions: [{
      component: "HostMonitoringView",
      label: "\u521B\u5EFA host-m-agent",
      permission: "host-monitoring.agents.write"
    }]
  };
}
export {
  activate
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs:
lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs:
lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs:
lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs:
lucide-react/dist/esm/defaultAttributes.mjs:
lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs:
lucide-react/dist/esm/context.mjs:
lucide-react/dist/esm/Icon.mjs:
lucide-react/dist/esm/createLucideIcon.mjs:
lucide-react/dist/esm/icons/activity.mjs:
lucide-react/dist/esm/icons/bell-dot.mjs:
lucide-react/dist/esm/icons/circle-check.mjs:
lucide-react/dist/esm/icons/circuit-board.mjs:
lucide-react/dist/esm/icons/copy.mjs:
lucide-react/dist/esm/icons/gauge.mjs:
lucide-react/dist/esm/icons/hard-drive.mjs:
lucide-react/dist/esm/icons/info.mjs:
lucide-react/dist/esm/icons/key-round.mjs:
lucide-react/dist/esm/icons/loader-circle.mjs:
lucide-react/dist/esm/icons/monitor-cog.mjs:
lucide-react/dist/esm/icons/monitor-dot.mjs:
lucide-react/dist/esm/icons/network.mjs:
lucide-react/dist/esm/icons/shield-check.mjs:
lucide-react/dist/esm/icons/thermometer.mjs:
lucide-react/dist/esm/icons/trash-2.mjs:
lucide-react/dist/esm/icons/x.mjs:
lucide-react/dist/esm/lucide-react.mjs:
  (**
   * @license lucide-react v1.35.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
