const isFunction = val => typeof val === 'function';

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

  result.then = resolve => {
    const next = S(resolve);
    next.cancel = () => result.cancel(next);
    callbacks.push(next);
    return next;
  };
  result.cancel = cb => {
    callbacks = callbacks.filter(v => v !== cb);
  };
  result.abort = () => {
    callbacks = [];
  };

  return result;
};

const beforeCancel = (beforeFn, fn) => cb => {
  beforeFn();
  fn(cb);
};

////

const effect = cb => {
  const sig = S();
  const onCancel = cb(sig);
  sig.cancel = () => {
    onCancel();
    sig.abort();
  };
  return sig;
};

////

const loopNext = (value, resolve) => {
  if (value.then) {
    value.then(resolve);
    return value;
  }
};

const loop = (makeGen, onNext = loopNext) => (...args) => {
  const sig = S();

  let gen,
      running,
      cancelled = false;

  const startOver = () => {
    gen = makeGen(...args);
    resolve();
  };
  
  const resolve = v => {
    if (cancelled) return;

    const result = gen.next(v);
    if (result.done) {
      if (result.value !== undefined) {
        sig(result.value);
        return;
      }
      startOver();
      return;
    }
    running = onNext(result.value, resolve);
  };

  const onCancel = () => {
    cancelled = true;
    if (running && running.cancel) running.cancel(resolve);
  };
  sig.cancel = beforeCancel(onCancel, sig.cancel);

  startOver();

  return sig;
};

module.exports = {
  S,
  effect,
  loop,
};
