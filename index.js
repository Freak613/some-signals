const isFunction = val => typeof val === 'function';

const globalRef = {
  current: null,
};
const createContext = () => ({ children: [], cache: new WeakMap() });
const registerInCurrentContext = subj => {
  if (globalRef.current === null) return;
  globalRef.current.children.push(subj);
};
const inGlobalContext = (nextGlobal, cb) => {
  const prev = globalRef.current;
  globalRef.current = nextGlobal;
  const result = cb();
  globalRef.current = prev;
  return result;
};

const S = init => {
  let value,
      callbacks = [],
      producer;

  if (isFunction(init)) {
    producer = init;
  } else {
    value = init;
  }

  const setValue = v => {
    if (producer) {
      value = producer(v);
    } else {
      value = v;
    }
  };

  const resolve = () => {
    result.age++;
    result.author = globalRef.current;
    const cbs = callbacks.slice();
    callbacks = [];
    cbs.forEach(fn => fn(value));
  }

  const result = v => {
    if (isFunction(v)) {
      const cb = v;
      return v => {
        const handled = cb(v);
        setValue(handled);
        resolve();
        return;
      };
    }
	  if (v !== undefined) {
      // Setter
      setValue(v);
      resolve();
      return;
    }
    // Getter
    return value;
  };

  result.age = value !== undefined ? 1 : 0;

  result.then = resolve => {
    const next = S(resolve);
    registerInCurrentContext(next);

    const origCancel = next.cancel;
    next.cancel = cb => {
      if (cb !== undefined) {
        origCancel(cb);
        return;
      }
      result.cancel(next);
    }
    callbacks.push(next);
    return next;
  };
  result.cancel = cb => {
    if (cb !== undefined) {
      callbacks = callbacks.filter(v => v !== cb);
      return;
    }
    callbacks = [];
  };

  return result;
};

////

const effect = cb => {
  const context = createContext();
  const sig = S();

  registerInCurrentContext(sig);

  const onCancel = inGlobalContext(context, () => cb(sig));

  const origCancel = sig.cancel;
  sig.cancel = cb => {
    if (cb !== undefined) {
      origCancel(cb);
      return;
    }

    if (onCancel) onCancel();
    context.children.forEach(child => {
      if (child.cancel) child.cancel();
    });
    origCancel();
  };

  return sig;
};

////

const take = source => {
  return {
    then: cb => {
      const cache = globalRef.current.cache;
      if (cache.has(source)) {
        const lastAge = cache.get(source);
        if (source.age > lastAge && source.author !== globalRef.current) {
          cache.set(source, source.age);
          cb(source());
          return;
        }
      }
      source.then(v => {
        cache.set(source, source.age);
        cb(v);
      });
    }
  }
}

const read = source => {
  const cache = globalRef.current.cache;
  cache.set(source, source.age);
  return source();
}

const loop = makeGen => {
  const sig = S();
  const context = createContext();

  let gen,
      running,
      cancelled = false;

  registerInCurrentContext(sig);

  const startOver = () => {
    context.children.forEach(child => {
      if (child.cancel) child.cancel();
    });
    context.children = [];
    gen = inGlobalContext(context, () => makeGen());
    resolve();
  };

  const onGettingSignal = (value, resolve) => {
    return inGlobalContext(context, () => {
      if (value.then) {
        value.then(resolve);
        return value;
      }
    })
  };
  
  const resolve = v => {
    if (cancelled) return;

    const result = inGlobalContext(context, () => gen.next(v));

    if (result.done) {
      if (result.value !== undefined) {
        sig(result.value);
        return;
      }
      startOver();
      return;
    }
    running = onGettingSignal(result.value, resolve);
  };

  const origCancel = sig.cancel;
  sig.cancel = cb => {
    if (cb !== undefined) {
      origCancel(cb);
      return;
    }
    cancelled = true;
    if (running && running.cancel) running.cancel(resolve);
    context.children.forEach(child => {
      if (child.cancel) child.cancel();
    });
  };

  startOver();

  return sig;
};

module.exports = {
  S,
  effect,
  take,
  loop,
  read,
};
