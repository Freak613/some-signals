const any = (fn, deps) => effect(sig => {
  const main = loop(function* () {
    const values = yield withLatestFrom(...deps);
    const result = fn(...values);
    if (result.then) {
      sig(yield result);
    } else {
      sig(result);
    }
  });
  const running = main();
  return () => running.cancel();
});

////

let name = 'Harry',
    surname = 'Potter',
    width = window.innerWidth;

const windowWidth = effect(sig => {
  const handleResize = sig(() => width = window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

// const ask = effect;

loop(function* () {
  document.title = `${name} ${surname}`; 
  
  const userEvents = yield ask(ev => render(
    <Card>
      <Row label="Name">
        <Input value={ name } onChange={ ev(v => name = v) } />
      </Row>
      <Row label="Surname">
        <Input value={ surname } onChange={ ev(v => surname = v) } />
      </Row>
      <Row label="Width">
        <Text>{ width }</Text>
      </Row>
    </Card>
  ));
  
  yield race(userEvents, windowWidth);
});

// with explicit
const userEvents = S();

loop(function* () {
  document.title = `${name} ${surname}`; 
  
  yield render(
    <Card>
      <Row label="Name">
        <Input value={ name } onChange={ userEvents(v => name = v) } />
      </Row>
      <Row label="Surname">
        <Input value={ surname } onChange={ userEvents(v => surname = v) } />
      </Row>
      <Row label="Width">
        <Text>{ width }</Text>
      </Row>
    </Card>
  );
  
  yield race(userEvents, windowWidth);
});

////

// Will work?
any(isLogging => {
  if (isLogging) {
    any(foo => console.log(foo), [foo]);
    any(bar => console.log(bar), [bar]);
    any(bleck => console.log(bleck), [bleck]);
  }
}, [isLogging]);

// Will work
loop(function* () {
  // Use current value
  if (isLogging()) {
    any(foo => console.log(foo), [foo]);
    any(bar => console.log(bar), [bar]);
    any(bleck => console.log(bleck), [bleck]);
  }
  // Wait for next value
  yield isLogging;
})


// Arrays
const id = ((id = 0) => () => id++)();

const arr = S([S(1)]);
// Disposable
loop(function* () {
  // Use current value
  arr().map(v => {
    const instance = id();
    any(() => console.debug(instance), [v]);
  });
  // Wait for next value
  yield arr;
});
arr()[0](1) // logs 0

const tmp = arr();
tmp.push(S(4));
arr(tmp);
arr()[0](1) // logs 1, instance id changed

// Non disposable
effect(() => {
  // Setup with current value
  arr().map(v => {
    const instance = id();
    any(v => console.debug(instance), [v]);
  });
  // React on next value
  loop(function* () {
    // Use current value
  	console.log('Array length', arr().length);
    // Wait for next value
    yield arr;
  });
});
arr()[0](1) // logs 0
// after changes
arr()[0](1) // logs 0, subscriptions not destroyed


// Sjs
const arr = S.data([S.data(1)]);
// disposable
S(() => {
  arr().map(v => {
    const instance = id();
    S.on(v, () => console.debug(instance));
  });
});
S.sample(arr)[0](1) // logs 0

const tmp = S.sample(arr);
tmp.push(S.data(4));
arr(tmp);
S.sample(arr)[0](1) // logs 1, instance id changed

// non disposable
S.root(() => {
  S.sample(arr).map(v => {
    const instance = id();
    S.on(v, () => console.debug(instance));
  });
  // Want to react on changes?
  S.on(arr, () => {
    console.log('Array length', arr().length);
  });
});


// clocks problem
const sig = S();
loop(function* () {
  console.log(sig());
  yield sleep(500); // while sig changed outside of the loop
  yield take(sig); // immediately resolves with new value
})

const sig = S();
loop(function* () {
  console.log(sig());
  sig(2);
  yield sig; // no take - no immediate reaction
})

const sig = S();
loop(function* () {
  yield sleep(500);
  console.log(sig());
  sig(2);  
  yield sig(); // no take - no immediate reaction
})
// we can build messaging system based on that



// Debouncing
const settleDown = (source, ms) => (
  loop(function* () {
  	let canProceed = false;
    
    yield race(
      // Will interrupt sleeping
      // therefore canProceed will = false
      // and loop starts over
      source,
      sleep(ms).then(() => canProceed = true)
    );
    
    if (canProceed) return true;
  })
);

// Debounce: leading=false
effect(sig => {
  loop(function* () {
    // Wait for first event
    yield keystroke;
    
    // Wait for settle down
    yield settleDown(keystroke, 500);
    
    // Do the work
    getData(keystroke()).then(sig);
  })
});

// Debounce: leading=true
effect(sig => {
  loop(function* () {
    // Wait for first event
    const search = yield keystroke;

    // Do the work
    getData(search).then(sig);
    
    // Wait for settle down
    yield settleDown(keystroke, 500);
  });
});

// Throttle: leading=true
effect(sig => {
  loop(function* () {
  	// Wait for first event
    const search = yield keystroke;

    // Do the work
    getData(search).then(sig);
    
    // Wait
    yield sleep(500);
  })
});

// Problem case
loop(function* () {
  any(foo => console.log(foo), [foo]);
  any(bar => console.log(bar), [bar]);
  any(bleck => console.log(bleck), [bleck]);

  if (isLogging()) {
    any(foo => console.log(foo), [foo]);
    any(bar => console.log(bar), [bar]);
    any(bleck => console.log(bleck), [bleck]);
  }

  yield isLogging;
})

// Streams aka chunks
const width = S(window.innerWidth);
effect(() => {
  const handleResize = () => width(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

const acc = effect(sig => {
  // Initialize acc
  sig([]);

  const push = sig(v => {
    // Get current instance
  	const acc = sig();
    // Push the value
    acc.push(v);
    // Trigger signal with updated acc;
    return acc;
  });

  // Collect values
  loop(function* () {
    push(yield width);
  })
});

loop(function* () {
  // Collect the chunk
  const chunk = yield take(acc);
  // Empty acc to get new chunk in next iteration
  acc([]);
  // Process it
  yield doLongChunkProcessing(chunk);
});