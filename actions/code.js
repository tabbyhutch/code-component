// eslint-disable-next-line import/no-extraneous-dependencies
const _ = require('lodash');
const vm = require('vm');
const { messages } = require('elasticio-node');
const co = require('co');
const request = require('co-request');

function wait(timeout) {
  return new Promise((ok) => {
    setTimeout(() => {
      this.logger.info('Done wait');
      ok();
    }, timeout);
    this.logger.info('Start wait sec=%s', timeout);
  });
}

// eslint-disable-next-line consistent-return,func-names
exports.process = async function (msg, conf, snapshot) {
  const ctx = vm.createContext({
    _,
    console,
    process,
    require,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    msg,
    exports: {},
    messages,
    request,
    wait: wait.bind(this),
    emitter: this,
  });
  this.logger.info('Running the code %s', conf.code);
  vm.runInContext(conf.code, ctx, {
    displayErrors: true,
  });
  this.logger.info("No result, let's check the run object if it was created?");
  if (ctx.run && typeof ctx.run.apply === 'function') {
    let result;
    if (ctx.run.constructor.name === 'GeneratorFunction') {
      this.logger.info('Run variable is a generator');
      const fn = co.wrap(ctx.run);
      result = fn.apply(this, [msg, conf, snapshot]);
    } else {
      this.logger.info('Run variable is a function, calling it');
      result = ctx.run.apply(this, [msg, conf, snapshot]);
    }
    if (typeof result === 'object' && typeof result.then === 'function') {
      this.logger.info('Returned value is a promise, will evaluate it');
      let returnResult;
      try {
        returnResult = await result;
        this.logger.info('Promise resolved');
        if (returnResult) {
          return messages.newMessageWithBody(returnResult);
        }
        this.emit('end');
      } catch (e) {
        this.logger.error('Promise failed', e);
        throw e;
      }
    }
  } else {
    this.logger.info("Run function was not found, it's over now");
    this.emit('end');
  }
};
