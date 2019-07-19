const { S, effect, loop } = require('./index');

describe('S', () => {
  test('returns initial value', () => {
    const sig = S('value');
    expect(sig()).toBe('value');
  })

  test('sets value', () => {
    const sig = S('value');
    sig('newvalue');
    expect(sig()).toBe('newvalue');
  })

  test('is thenable', () => {
    const sig = S('value');

    let result;
    sig.then(v => result = v);

    sig('newvalue');

    expect(result).toBe('newvalue');
  })

  test('cancels then after first run', () => {
    const sig = S('value');

    let result;
    sig.then(v => result = v);

    sig('newvalue');
    sig('newvalue2');

    expect(result).toBe('newvalue');
  })

  test('resolves with handler', () => {
    const sig = S(v => `${v}handled`);

    let result;
    sig.then(v => result = v);

    sig('newvalue');

    expect(result).toBe('newvaluehandled');
  })

  test('cancellable', () => {
    const sig = S('value');

    let result = 'notUpdated';
    const sig2 = sig.then(v => result = v);
    sig2.cancel();

    sig('newvalue');

    expect(result).toBe('notUpdated');
  })

  test('set with callback sets additional handler', () => {
    const sig = S('value');

    let result;
    sig.then(v => result = v);

    const subsig = sig(v => `${v}subsig`);

    subsig('newvalue');

    expect(result).toBe('newvaluesubsig');
  })
});

describe('effect', () => {
  test('works', () => {
    let started = false,
        disposed = false;
    const result = effect(sig => {
      started = true;
      sig(1);
      return () => {
        disposed = true;
      }
    });
    expect(result()).toBe(1);
    expect(started).toBe(true);

    result.cancel();
    expect(disposed).toBe(true);
  });
});

describe('loop', () => {
  test('works', () => {
    const sig = S();
    let result = 0;
    const main = loop(function* () {
      yield sig;
      result++;
      if (result === 3) {
        return 'final';
      }
    });
    const sigMain = main();
    expect(result).toBe(0);

    sig(null);
    expect(result).toBe(1);

    sig(null);
    expect(result).toBe(2);

    expect(sigMain()).toBe(undefined);

    sig(null);
    expect(result).toBe(3);
    expect(sigMain()).toBe('final');
  })
});
