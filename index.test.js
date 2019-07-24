const { S, effect, loop, take } = require('./index');

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

  describe('on cancel', () => {
    test('disposes nested thenables', () => {
      let carryover,
          leakingValue;
      const effectSig = effect(() => {
        carryover = S();
  
        carryover.then(v => {
          leakingValue = v;
        });
      });
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');
  
      effectSig.cancel();
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })
  
    test('disposes nested effects', () => {
      let carryover,
          leakingValue;
      const effectSig = effect(() => {
        effect(sig => {
          carryover = sig;
          carryover.then(v => {
            leakingValue = v;
          });
        });
      });
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');
  
      effectSig.cancel();
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })
  
    test('disposes nested loops', () => {
      let carryover,
          leakingValue;
      const effectSig = effect(() => {
        carryover = S();
        loop(function* () {
          const v = yield carryover;
          leakingValue = v;
        });
      });
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');
  
      effectSig.cancel();
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })
  });
});

describe('take', () => {
  describe('if original is not resolved yet', () => {
    test('wait for next value', () => {
      effect(() => {
        const original = S();
        const cached = take(original);
    
        let result;
        cached.then(v => result = v);
    
        expect(result).toBe(undefined);
    
        original('myvalue');
        expect(result).toBe('myvalue');
      })
    })
  })

  describe('if original is resolved outside and unhandled', () => {
    test.skip('immediately resolves', () => {
      effect(() => {
        const original = S();
        const cached = take(original);
  
        original('myvalue1');
  
        let result;
        cached.then(v => result = v);
    
        expect(result).toBe('myvalue');
  
        // after that switching back to original
        let result2;
        cached.then(v => result2 = v);
        expect(result2).toBe(undefined);
  
        original('mynextvalue');
        expect(result2).toBe('mynextvalue');
      })
    })
  })
});

describe('loop', () => {
  test('works', () => {
    const sig = S();
    let result = 0;
    const sigMain = loop(function* () {
      yield sig;
      result++;
      if (result === 3) {
        return 'final';
      }
    });
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

  // Tests can't use .then because it wont outlive anything
  describe('on next iteration', () => {
    test('disposes nested thenables', () => {
      const loopControl = S(),
            carryover = S();
      let leakingValue,
          id = 0;
      const main = loop(function* () {
        if (id++ === 0) {
          carryover.then(v => {
            leakingValue = v;
          });
        }

        yield loopControl;
      });
      main();
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');

      loopControl(null);
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })

    test('disposes nested loops', () => {
      const loopControl = S(),
            carryover = S();
      let leakingValue,
          id = 0;
      const main = loop(function* () {
        if (id++ === 0) {
          const sub = loop(function* () {
            const v = yield carryover;
            leakingValue = v;
          });
          sub();
        }

        yield loopControl;
      });
      main();
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');

      loopControl(null);
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })

    test('disposes nested effects', () => {
      const loopControl = S(),
            carryover = S();
      let leakingValue,
          id = 0;
      const main = loop(function* () {
        if (id++ === 0) {
          effect(() => {
            carryover.then(v => {
              leakingValue = v;
            });
          });
        }

        yield loopControl;
      });
      main();
  
      carryover('myvalue');
      expect(leakingValue).toBe('myvalue');

      loopControl(null);
      carryover('mynextvalue');
      expect(leakingValue).toBe('myvalue');
    })
  });

  describe('timing', () => {
    describe('if signal changed outside after start loop', () => {
      test.skip('resolve immediately', () => {
        const proceed = S();
        const source = S();
        let result;
        loop(function* () {
          yield proceed;
          const sValue = yield take(source);
          result = sValue + 1;
        });

        expect(result).toBe(undefined);

        source(1000);
        proceed(1);
        expect(result).toBe(1001);
      })
    })

    describe('if signal changed inside the loop in start tick', () => {
      test('doesnt resolve immediately', () => {
        const proceed = S();
        const source = S();
        let result;
        loop(function* () {
          source(1000);
          yield proceed;
          const sValue = yield source;
          result = sValue + 1;
        });

        expect(result).toBe(undefined);

        proceed(1);
        expect(result).toBe(undefined);
      })
    })

    describe('if signal changed inside the loop after start tick', () => {
      test('doesnt resolve immediately', () => {
        const proceed = S();
        const source = S();
        let result;
        loop(function* () {
          yield proceed;
          source(1000);
          const sValue = yield source;
          result = sValue + 1;
        });

        expect(result).toBe(undefined);

        proceed(1);
        expect(result).toBe(undefined);
      })
    })
  })
});
