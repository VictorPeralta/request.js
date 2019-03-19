import test from 'ava'
import request from '.'

test('request: default request headers', async t => {
  const { data, type, status, statusText, url } = await request('https://httpbin.org/get')
  t.is(data.url, 'https://httpbin.org/get')
  t.is(data.headers['Content-Type'], 'application/json')
  t.is(type, 'success')
  t.is(status, 200)
  t.is(statusText, 'OK')
  t.is(url, 'https://httpbin.org/get')
})

test('request: querystring', async t => {
  const { data } = await request('https://httpbin.org/get', { params: { a: 'b', c: 'd', e: undefined } })
  t.is(data.url, 'https://httpbin.org/get?a=b&c=d')
})

test('request: custom stringify', async t => {
  const { data } = await request('https://httpbin.org/get', { params: { a: 'b', c: 'd' }, stringify: () => 'a=b' })
  t.is(data.url, 'https://httpbin.org/get?a=b')
})

test('request: json body', async t => {
  const { data } = await request('https://httpbin.org/post', { method: 'POST', body: { a: 'b', c: 'd' } })
  t.deepEqual(data.json, { a: 'b', c: 'd' })
})

test('request: redirect', async t => {
  const { data, status } = await request('https://httpbin.org/redirect-to?url=get')
  t.is(data.url, 'https://httpbin.org/get')
  t.is(status, 200)
})

test('request: redirect manual', async t => {
  const { type, status } = await request('https://httpbin.org/redirect-to?url=get', { redirect: 'manual' })
  t.is(type, 'error')
  t.is(status, 302)
})

test('request: can override default content-type header, case insensitive', async t => {
  const { data } = await request('https://httpbin.org/headers', { headers: { 'CONTENT-TYPE': '*/*' } })
  t.is(data.headers['Content-Type'], '*/*')
})

// client code must manually stringify request body and parse response JSON
test('request: jsonIn and jsonOut false', async t => {
  const { data } = await request(
    'https://httpbin.org/post',
    { method: 'POST', body: JSON.stringify({ a: 'b', c: 'd' }), jsonIn: false, jsonOut: false },
  )
  const text = await data.text()
  const parsed = JSON.parse(text)
  t.deepEqual(parsed.json, { a: 'b', c: 'd' })
})

test('request: response headers are object literal', async t => {
  const { headers } = await request('https://httpbin.org/get')
  t.is(headers['content-encoding'], 'gzip')
})

test('request: error', async t => {
  const { type, status } = await request('https://httpbin.org/GET')
  t.is(status, 404)
  t.is(type, 'error')
})

test('request: exception', async t => {
  const { data, type, ...rest } = await request('https://httpbin.smorg/get')
  t.is(data.code, 'ENOTFOUND')
  t.is(type, 'exception')
  t.deepEqual(rest, {})
})

test('request: convenience methods', async t => {
  let response = await request.post('https://httpbin.org/post', { body: { a: 'b' } })
  t.is(response.type, 'success')
  t.is(response.data.json.a, 'b')
  response = await request.delete('https://httpbin.org/delete')
  t.is(response.type, 'success')
  response = await request.get('https://httpbin.org/post')
  t.is(response.type, 'error')
})

// backoff
test.cb('retry: retries on exception, increases delay', t => {
  t.plan(5)

  const shouldRetry = ({ type }, { retries, delay }) => {
    t.is(type, 'exception')
    if (retries <= 1) {
      t.is(delay, 1000)
      t.end()
    }
    return type === 'exception'
  }
  request('https://httpbin.smorg/get', { retry: { shouldRetry, delay: 125 } })
})

test('retry: eventually returns response', async t => {
  const { type } = await request('https://httpbin.smorg/get', { retry: { delay: 250, retries: 3 } })
  t.is(type, 'exception')
})

test.cb('retry: callback style', t => {
  t.plan(1)

  request('https://httpbin.smorg/get', { retry: { delay: 250, retries: 3 } }).then(({ type }) => {
    t.is(type, 'exception')
    t.end()
  })
})

test.cb('retry: retries on custom condition', t => {
  t.plan(4)

  const shouldRetry = ({ status }, { retries }) => {
    t.pass()
    if (retries <= 1) t.end()
    return status === 500
  }
  request('https://httpbin.org/status/500', { retry: { shouldRetry, delay: 125 } }, )
})

test('retry: no exception -> no retry', async t => {
  const shouldRetry = ({ type }, { retries }) => {
    t.pass()
    if (retries < 3) t.fail()
    return type === 'exception'
  }
  await request('https://httpbin.org/status/500', { retry: { shouldRetry, retries: 3, delay: 125 } })
})
