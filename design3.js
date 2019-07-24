const any = (fn, deps) => effect(sig => {
  const main = loop(function* () {
    const values = yield all(...deps);
    sig(fn(...values));
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

const ask = effect;

// Renders and handles events
const userEvents = ask(ev => render(
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

const main = loop(function* () {
  document.title = `${name} ${surname}`; 
  
  yield race(userEvents, windowWidth);
});

main();

////

// Won't work
any(isLogging => {
  if (isLogging) {
    any(foo => console.log(foo), [foo]);
    any(bar => console.log(bar), [bar]);
    any(bleck => console.log(bleck), [bleck]);
  }
}, [isLogging]);

// Will work
loop(function* () {
  // Check current value and setup effects
  if (isLogging()) {
    any(foo => console.log(foo), [foo]);
    any(bar => console.log(bar), [bar]);
    any(bleck => console.log(bleck), [bleck]);
  }
  // Wait for next update and repeat the process
  yield isLogging;
})

