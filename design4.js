const name = S('Harry'),
      surname = S('Potter');

any((name, surname) => {
  document.title = `${name} ${surname}`;
}, [name, surname]);

const width = S(window.innerWidth);
effect(() => {
  const handleResize = () => width(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => {
  	window.removeEventListener('resize', handleResize);
  };
});

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


////

const payload = S();
render(<Component onSubmit={ payload });
yield payload;

payload().field = 'somevalue';

const request = send('http/url', payload());

yield waitAtLeast(500, request);

yield render('');

window.scrollTo(0,0);

return toApp;

////

const S = () => {
  const callbacks = [];
  let value;
  const result = v => {
	if (v !== undefined) {
      value = v;
      callbacks.forEach(fn => fn(v));
      return;
    }
    return value;
  };
  result.then = fn => callbacks.push(fn);
  return result;
};
const name = S();
const surname = S();

const run = async () => {
  await name;
  await surname;
};

////

let resolve;
const p = new Promise(r => resolve = r);
p.then(v => console.log(`My value = ${v}`));