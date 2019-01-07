const RunCode = require('./runCode.js');
const Utils = require('../../../utils/utils');
const Terser = require('terser');

const WEB3_INVALID_RESPONSE_ERROR = 'Invalid JSON RPC response';

class CodeRunner {
  constructor(options) {
    this.config = options.config;
    this.plugins = options.plugins;
    this.logger = options.logger;
    this.events = options.events;
    this.ipc = options.ipc;
    this.commands = [];
    this.runCode = new RunCode({logger: this.logger});
    this.registerIpcEvents();
    this.IpcClientListen();
    this.registerEvents();
    this.registerCommands();
  }

  registerIpcEvents() {
    if (!this.ipc.isServer()) {
      return;
    }

    this.ipc.on('runcode:getCommands', (_err, callback) => {
      let result = {web3Config: this.runCode.getWeb3Config(), commands: this.commands};
      callback(null, result);
    });
  }

  IpcClientListen() {
    if (!this.ipc.isClient() || !this.ipc.connected) {
      return;
    }

    this.ipc.listenTo('runcode:newCommand', (command) => {
      if (command.varName) {
        this.events.emit("runcode:register", command.varName, command.code);
      } else {
        this.events.request("runcode:eval", command.code);
      }
    });
  }

  registerEvents() {
    this.events.on("runcode:register", this.registerVar.bind(this));
  }

  registerCommands() {
    this.events.setCommandHandler('runcode:getContext', (cb) => {
      cb(this.runCode.context);
    });
    this.events.setCommandHandler('runcode:eval', this.evalCode.bind(this));
  }

  registerVar(varName, code, toRecord = true) {
    if (this.ipc.isServer() && toRecord) {
      this.commands.push({varName, code});
      this.ipc.broadcast("runcode:newCommand", {varName, code});
    }
    this.runCode.registerVar(varName, code);
  }

  async evalCode(code, cb, forConsoleOnly = false, tolerateError = false) {
    cb = cb || function() {};
    const awaiting = code.indexOf('await') > -1;
    const uglifyResult = Terser.minify(code, {
      compress: false, // pass false to skip compressing entirely
      mangle: false, // pass false to skip mangling names
      keep_fnames: true, // pass true to prevent discarding or mangling of function names. Useful for code relying on Function.prototype.name
      ecma: 8
    });
    if (uglifyResult.error) return cb(uglifyResult.error.message);

    const instructions = Utils.compact(uglifyResult.code.split(';'));
    const last = instructions.pop().trim();

    if (!(last.startsWith('return') || last.indexOf('=') > -1)) {
      instructions.push(`return ${last}`);
    } else {
      instructions.push(last);
    }

    code = `module.exports = (${awaiting ? "async" : ""} () => {${instructions.join(';')};})()`;
    let result = this.runCode.doEval(code, tolerateError, forConsoleOnly);

    if (forConsoleOnly && this.ipc.isServer()) {
      this.commands.push({code});
      this.ipc.broadcast("runcode:newCommand", {code});
    }

    if (!awaiting) {
      return cb(null, result);
    }

    try {
      const value = await result;
      cb(null, value);
    } catch (error) {
      // Improve error message when there's no connection to node
      if (error.message && error.message.indexOf(WEB3_INVALID_RESPONSE_ERROR) !== -1) {
        error.message += '. Are you connected to an Ethereum node?';
      }

      cb(error);
    }
  }

}

module.exports = CodeRunner;
