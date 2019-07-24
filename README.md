## Status

This is research repo. No code is working. Don't use it anywhere. 

## Story

Let's start with Promise and create dirty polyfill:
```javascript
// Called S for no reason, though API somewhat similar to S.js
const S = () => {
  let value,
      callbacks = [];
  
  const getSet = v => {
    if (v !== undefined) {
      value = v;
      callbacks.forEach(cb => cb(v));
      callbacks = [];
      return;
    }
    return value;
  }
  getSet.then = cb => callbacks.push(cb);
  
  return getSet;
}
```
The difference here that this "promise" is reusable, but still disposing `then` callbacks after each resolve.

So no we can:
```javascript
const box = S();
// Read the value
box();
// Set the value
box(1);

// Ask for next value
box.then(v => console.log(v));
// Resolve it
box(2); // logs "2"
// Callback disposed after first call
box(3); // does nothing
```

After some changes we made it more interesting:
```javascript
// It can have initial value
const box = S(1);
box(); // 1

// We can setup mapping function called on each set
const mappedBox = S(v => v * 10);
mappedBox(1);
mappedBox(); // 10

// It's cancellable
const box = S(1);
box.then(v => console.log(v));
box.cancel(); // clean all callbacks
box(2); // Does nothing

// Can produce defferred setters
const actions = S();
const increase = actions(() => 'INCREASE');
const decrease = actions(() => 'DECREASE');
increase(1);
actions(); // 'INCREASE'
decrease(1);
actions(); // 'DECREASE'
```

Now we can move to `effect` function.
It will create signal and provide it to callback, to controll it imperatively, returning same signal as result
```javascript
const windowWidth = effect(sig => {
  // Defferred setter, returning window width
  const handleResize = () => sig(window.innerWidth);
  // Listen
  window.addEventListener('resize', handleResize);
  // onCancel
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});
// Now whenever window be resized, we'll have last width value in signal
windowWidth(); // 1140
// To make it worse, it can be modified from outside
windowWidth(0);
// And it's cancellable
windowWidth.cancel(); // removes listener
```

And `loop` function to work with signals inside of generator function.
After iteration ends, it starts over. To break the loop, return anyting(except `undefined`):
```javascript
loop(function* () {
  // yield accepts thenable values
  const width = yield windowWidth;
  // Log new value
  console.log(width);
  // Start over
});
```
Now we can have looping computations with step-by-step processing.

After some work, `effect` and `loop` can cancel all inner signals/subscriptions.
All `then/yield/effect/loop` will register in current running context:
```javascript
const widthLoggers = effect(() => {

  loop(function* () {
    console.log('1', yield windowWidth);
  })

  loop(function* () {
    console.log('2', yield windowWidth);
  })

});

windowWidth(100); // logs "100" two times
widthLogger.cancel();
windowWidth(100); // does nothing

// loops works similar + cancels all created computations when iteration ends
loop(function* () {
  effect(sig => {
    console.log('started');
    return () => {
      console.log('disposed');
    };
  })

  yield something;
})
// logs "started"
something(1);
// logs:
// disposed
// started
```

Now we can start having fun with it.

Consider we have `render` function that will render provided JSX element somewhere.
```javascript
// Let's build some component using shared state variables
let name = 'Harry',
    surname = 'Potter',
    width = window.innerWidth;

const resized = effect(sig => {
  // Will update local width variable and trigger signal
  const handleResize = sig(() => width = window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

const userEvents = S();

loop(function* () {
  // Side effects
  document.title = `${name} ${surname}`; 

  // Create event handlers, that also will update local variables and trigger signals
  const setName = userEvents(v => name = v);
  const setSurname = userEvents(v => surname = v);
  
  // render is thenable, so we can wait until it completes
  yield render(
    <Card>
      <Row label="Name">
        <Input value={ name } onChange={ setName } />
      </Row>
      <Row label="Surname">
        <Input value={ surname } onChange={ setSurname } />
      </Row>
      <Row label="Width">
        <Text>{ width }</Text>
      </Row>
    </Card>
  );
  
  // race works similar to Promise.race
  // Wait until some user event or window resized
  yield race(userEvents, resized);
  // And repeat the process
});
```
So now we have component state machine that will wait for new events coming and updates accordingly.

Feels too verbose?
What if we create little helper here:
```javascript
// On any of dependencies changed,
// it will recompute the value
const any = (fn, deps) => effect(sig => {
  loop(function* () {
    // withLatestFrom will be triggered by update of any dependency
    // and return array of latest values
    // Like rxjs/withLatestFrom
    const values = yield withLatestFrom(...deps);
    sig(fn(...values));
  });
});
```

Let's try it:
```javascript
const name = S('Harry'),
      surname = S('Potter');

any((name, surname) => {
  document.title = `${name} ${surname}`;
}, [name, surname]);

const width = effect(sig => {
  const handleResize = () => sig(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

// We don't use provided callback values to not shadow outer ones,
// as we need to set them from rendered element
any(() => render(
  <Card>
    <Row label="Name">
      <Input value={ name() } onChange={ name } />
    </Row>
    <Row label="Surname">
      <Input value={ surname() } onChange={ surname } />
    </Row>
    <Row label="Width">
      <Text>{ width() }</Text>
    </Row>
  </Card>
), [name, surname, width]);
```
Now it's better!
Almost the same as with [React Hooks](https://twitter.com/threepointone/status/1056594421079261185)

In general, a rule of thumb with `loop` is
- use current value
- wait for next value

What if we need to setup logging based on some signal
```javascript
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
```

In fact the whole thing looks like goroutines or some CSP-style processing. Signals are like channels with buffer size 1. The difference here is that producer doesn't wait until value has processed. And readers always have access to only latest value. It's like self-regulating system, that will automatically adopt when producer has higher update frequency than its readers has. For example, with UI rendering that always takes some time(especially if it's asynchronous), there is no reason to trigger new update until current completed and it's fine to skip high freq data if it can't be handled on time (if your screen has lower refresh rate).

Nothing new here, as there are already libraries that works with generators or provide [coroutine](https://github.com/tj/co) adoption.

And we can try to solve some time sensitive tasks with it.

What about throttling?
```javascript
// Throttle: leading=true
loop(function* () {
  // Wait for first event
  const search = yield keystroke;

  // Do the work
  getData(search);
  
  // Wait
  yield sleep(500);
})
```

Maybe debouncing?
```javascript
// Create a little helper
// Wait until some time passed after last signal reaction
const settleDown = (source, ms) => (
  loop(function* () {
    let canProceed = false;
    
    yield race(
      // Will interrupt sleeping
      // therefore canProceed will = false
      source,
      sleep(ms).then(() => canProceed = true)
    );
    
    if (canProceed) return true;
  })
);

// Debounce: leading=false
loop(function* () {
  // Wait for first event
  yield keystroke;
  
  // Wait for settle down
  yield settleDown(keystroke, 500);
  
  // Do the work
  getData(keystroke());
})

// Debounce: leading=true
loop(function* () {
  // Wait for first event
  const search = yield keystroke;

  // Do the work
  getData(search);
  
  // Wait for settle down
  yield settleDown(keystroke, 500);
});
```

Going back to CSP subject. It's possible to have some long running processing while new values coming.
```javascript
loop(function* () {
  const data = yield sig;
  yield render(data); // while new value coming to sig
});
```
In this case it will work like throttling, ignoring new values on given timeline.

To process heading and trailing values, we can use `take` and `read` helpers. They will use current context cache to store last signal age when signal was accessed and resolve immediately if it has new one. For this purpose, signals have age (and change author) fields, that will increase with each update.
```javascript
loop(function* () {
  const data = yield take(sig);
  yield render(data); // while new value coming to sig
});
```
Given timeline:
- `sig(1)`
- `[render(1), sig(2), sig(3), sig(4)]` that happens in parallel.

It will do:
- `render(1)`
- `render(4)`

So heading and trailing values are captured.

If we want to process ALL coming signal values, we can collect handle them in chunks:
```javascript
// Streams aka chunks
const width = effect(sig => {
  const handleResize = () => sig(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

const accWidth = effect(sig => {
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
  const chunk = yield take(accWidth);
  // Empty acc to get new chunk in next iteration
  accWidth([]);
  // Process it
  yield doLongChunkProcessing(chunk);
});
```
Ability to read and set `accWidth` value is coming from single-threaded JS nature, as we can be sure that this value will not be accessed by someone at the same time. If it would be multi-threaded JS, then goroutines blocking approach would be better here.

With these tools and imperative rendering with `render` calls it's possible to build synchronized system and get somewhat similar to coming React scheduler system, where we can manually slow down and tune updating process on what, when and in what order will be rendered on the screen.

It deviates from popular make-everything-declarative mindset and rolls back to plain old days when we had screen driver (`render`) that can be slow (and it is slow in JS-to-DOM) and imperative code to flush the screen and display next frame.

When we approach sequential and transitional problems, we don't approach them in declarative manner:
```javascript
// Instead of
if (isLoading) return <Spinner/>;
if (data) return <Content/>;

// We think
startLoading();
// prevent screen flickering on fast networks
if (no data after 500 ms) render(<Spinner/>);
await data;
render(<Content/>);
```

How this differs from streaming approach(RxJS and friends). With CSP:
- It's easier to access only last value from stream without setting up subscriptions etc
- More flexibility handling high freq data by default, while with streams you have to place throttle/debounce wisely.
