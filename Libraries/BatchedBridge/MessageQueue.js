/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const ErrorUtils = require('ErrorUtils');
const Systrace = require('Systrace');

const deepFreezeAndThrowOnMutationInDev = require('deepFreezeAndThrowOnMutationInDev');
const invariant = require('invariant');
const stringifySafe = require('stringifySafe');

export type SpyData = {
  type: number,
  module: ?string,
  method: string | number,
  args: any[],
};

const TO_JS = 0; // 枚举值
const TO_NATIVE = 1; // 枚举值

const MODULE_IDS = 0; // 枚举值
const METHOD_IDS = 1; // 枚举值
const PARAMS = 2; // 枚举值
const MIN_TIME_BETWEEN_FLUSHES_MS = 5; // 两次队列刷新之间的最小间隔 5 毫秒

// eslint-disable-next-line no-bitwise
const TRACE_TAG_REACT_APPS = 1 << 17; // 131072

const DEBUG_INFO_LIMIT = 32;

class MessageQueue {
  // 可懒回调的模块，在调用 getCallableModule 时，才加载模块
  _lazyCallableModules: {[key: string]: (void) => Object};
  // 消息队列
  // MODULE_IDS 队列 | METHOD_IDS 队列 | PARAMS 队列 | 当前调用id
  _queue: [number[], number[], any[], number];
  // 成功回调
  _successCallbacks: {[key: number]: ?Function};
  // 失败回调
  _failureCallbacks: {[key: number]: ?Function};
  // 当前调用id
  _callID: number; // 
  // 最后刷新时间
  _lastFlush: number;
  // 时间循环开启时间
  _eventLoopStartTime: number;
  // 立即回调
  _immediatesCallback: ?() => void;

  // 调试信息
  _debugInfo: {[number]: [number, number]};
  // 远程模块表
  _remoteModuleTable: {[number]: string};
  // 远程方法表
  _remoteMethodTable: {[number]: string[]};

  __spy: ?(data: SpyData) => void;

  constructor() {
    this._lazyCallableModules = {};
    this._queue = [[], [], [], 0];
    this._successCallbacks = {};
    this._failureCallbacks = {};
    this._callID = 0;
    this._lastFlush = 0;
    this._eventLoopStartTime = Date.now();
    this._immediatesCallback = null;

    if (__DEV__) {
      this._debugInfo = {};
      this._remoteModuleTable = {};
      this._remoteMethodTable = {};
    }

    (this: any).callFunctionReturnFlushedQueue = this.callFunctionReturnFlushedQueue.bind(
      this,
    );
    (this: any).callFunctionReturnResultAndFlushedQueue = this.callFunctionReturnResultAndFlushedQueue.bind(
      this,
    );
    (this: any).flushedQueue = this.flushedQueue.bind(this);
    (this: any).invokeCallbackAndReturnFlushedQueue = this.invokeCallbackAndReturnFlushedQueue.bind(
      this,
    );
  }

  /**
   * Public APIs
   */
  // 开启Native与JS之间通讯的监控
  static spy(spyOrToggle: boolean | ((data: SpyData) => void)) {
    if (spyOrToggle === true) {
      MessageQueue.prototype.__spy = info => {
        console.log(
          `${info.type === TO_JS ? 'N->JS' : 'JS->N'} : ` +
            `${info.module ? info.module + '.' : ''}${info.method}` +
            `(${JSON.stringify(info.args)})`,
        );
      };
    } else if (spyOrToggle === false) {
      MessageQueue.prototype.__spy = null;
    } else {
      MessageQueue.prototype.__spy = spyOrToggle;
    }
  }
  // 调用函数，并返回刷新后的队列
  callFunctionReturnFlushedQueue(module: string, method: string, args: any[]) {
    console.log(
      'MessageQueue',
      'callFunctionReturnFlushedQueue',
      'module:',
      module,
      'method:',
      method,
      'args:',
      args,
      '_callID',
      this._callID,
      'queue',
      this._queue,
    );
    this.__guard(() => {
      this.__callFunction(module, method, args);
    });
    return this.flushedQueue();
  }
  // 调用函数，并返回调用结果和刷新厚度队列
  callFunctionReturnResultAndFlushedQueue(
    module: string,
    method: string,
    args: any[],
  ) {
    console.log(
      'MessageQueue',
      'callFunctionReturnResultAndFlushedQueue',
      'module:',
      module,
      'method:',
      method,
      'args:',
      args,
    );
    let result;
    this.__guard(() => {
      result = this.__callFunction(module, method, args);
    });

    return [result, this.flushedQueue()];
  }
  // 激活回调，并返回刷新后的队列
  invokeCallbackAndReturnFlushedQueue(cbID: number, args: any[]) {
    console.log(
      'MessageQueue',
      'invokeCallbackAndReturnFlushedQueue',
      'cbID:',
      cbID,
      'args:',
      args,
    );
    this.__guard(() => {
      this.__invokeCallback(cbID, args);
    });
    return this.flushedQueue();
  }

  flushedQueue() {
    console.log('MessageQueue', 'flushedQueue', 'queue:', this._queue);
    this.__guard(() => {
      // 调用需要立即执行的回调
      this.__callImmediates();
    });

    const queue = this._queue;
    // 重置消息队列
    this._queue = [[], [], [], this._callID];
    // 返回执行后的队列
    return queue[0].length ? queue : null;
  }

  getEventLoopRunningTime() {
    console.log('MessageQueue', 'getEventLoopRunningTime');
    return Date.now() - this._eventLoopStartTime;
  }

  registerCallableModule(name: string, module: Object) {
    console.log(
      'MessageQueue',
      'registerCallableModule',
      'name:',
      name,
      'module:',
      module,
    );
    this._lazyCallableModules[name] = () => module;
  }

  registerLazyCallableModule(name: string, factory: void => Object) {
    console.log(
      'MessageQueue',
      'registerLazyCallableModule',
      'name:',
      name,
      'factory:',
      factory,
    );
    let module: Object;
    let getValue: ?(void) => Object = factory;
    this._lazyCallableModules[name] = () => {
      if (getValue) {
        module = getValue();
        getValue = null;
      }
      return module;
    };
  }

  getCallableModule(name: string) {
    console.log('MessageQueue', 'getCallableModule', 'name:', name);
    const getValue = this._lazyCallableModules[name];
    return getValue ? getValue() : null;
  }

  // 入队 Native 的调用
  enqueueNativeCall(
    moduleID: number,
    methodID: number,
    params: any[],
    onFail: ?Function,
    onSucc: ?Function,
  ) {
    console.log(
      'MessageQueue',
      'enqueueNativeCall',
      'moduleID:',
      moduleID,
      'methodID:',
      methodID,
      'params:',
      params,
      'onFail:',
      onFail,
      'onSucc:',
      onSucc,
    );
    if (onFail || onSucc) {
      if (__DEV__) {
        this._debugInfo[this._callID] = [moduleID, methodID];
        if (this._callID > DEBUG_INFO_LIMIT) {
          delete this._debugInfo[this._callID - DEBUG_INFO_LIMIT];
        }
      }
      // Encode callIDs into pairs of callback identifiers by shifting left and using the rightmost bit
      // to indicate fail (0) or success (1)
      // 通过左移，并使用最右边的位，将callID编码为成一对回调标识符，用于标记失败或成功
      // eslint-disable-next-line no-bitwise
      onFail && params.push(this._callID << 1);
      // eslint-disable-next-line no-bitwise
      onSucc && params.push((this._callID << 1) | 1);
      this._successCallbacks[this._callID] = onSucc;
      this._failureCallbacks[this._callID] = onFail;
    }

    if (__DEV__) {
      global.nativeTraceBeginAsyncFlow &&
        global.nativeTraceBeginAsyncFlow(
          TRACE_TAG_REACT_APPS,
          'native',
          this._callID,
        );
    }
    this._callID++;

    this._queue[MODULE_IDS].push(moduleID);
    this._queue[METHOD_IDS].push(methodID);

    if (__DEV__) {
      // Validate that parameters passed over the bridge are
      // folly-convertible.  As a special case, if a prop value is a
      // function it is permitted here, and special-cased in the
      // conversion.
      const isValidArgument = val => {
        const t = typeof val;
        if (
          t === 'undefined' ||
          t === 'null' ||
          t === 'boolean' ||
          t === 'string'
        ) {
          return true;
        }
        if (t === 'number') {
          return isFinite(val);
        }
        if (t === 'function' || t !== 'object') {
          return false;
        }
        if (Array.isArray(val)) {
          return val.every(isValidArgument);
        }
        for (const k in val) {
          if (typeof val[k] !== 'function' && !isValidArgument(val[k])) {
            return false;
          }
        }
        return true;
      };

      // Replacement allows normally non-JSON-convertible values to be
      // seen.  There is ambiguity with string values, but in context,
      // it should at least be a strong hint.
      const replacer = (key, val) => {
        const t = typeof val;
        if (t === 'function') {
          return '<<Function ' + val.name + '>>';
        } else if (t === 'number' && !isFinite(val)) {
          return '<<' + val.toString() + '>>';
        } else {
          return val;
        }
      };

      // Note that JSON.stringify
      invariant(
        isValidArgument(params),
        '%s is not usable as a native method argument',
        JSON.stringify(params, replacer),
      );

      // The params object should not be mutated after being queued
      deepFreezeAndThrowOnMutationInDev((params: any));
    }
    this._queue[PARAMS].push(params);

    const now = Date.now();
    if (
      global.nativeFlushQueueImmediate &&
      now - this._lastFlush >= MIN_TIME_BETWEEN_FLUSHES_MS
    ) {
      const queue = this._queue;
      this._queue = [[], [], [], this._callID];
      this._lastFlush = now;
      global.nativeFlushQueueImmediate(queue);
    }
    Systrace.counterEvent('pending_js_to_native_queue', this._queue[0].length);
    if (__DEV__ && this.__spy && isFinite(moduleID)) {
      this.__spy({
        type: TO_NATIVE,
        module: this._remoteModuleTable[moduleID],
        method: this._remoteMethodTable[moduleID][methodID],
        args: params,
      });
    } else if (this.__spy) {
      this.__spy({
        type: TO_NATIVE,
        module: moduleID + '',
        method: methodID,
        args: params,
      });
    }
  }

  createDebugLookup(moduleID: number, name: string, methods: string[]) {
    if (__DEV__) {
      this._remoteModuleTable[moduleID] = name;
      this._remoteMethodTable[moduleID] = methods;
    }
  }

  // For JSTimers to register its callback. Otherwise a circular dependency
  // between modules is introduced. Note that only one callback may be
  // registered at a time.
  setImmediatesCallback(fn: () => void) {
    console.log('MessageQueue', 'setImmediatesCallback', 'fn:', fn);
    this._immediatesCallback = fn;
  }

  /**
   * Private methods
   */

  __guard(fn: () => void) {
    if (this.__shouldPauseOnThrow()) {
      fn();
    } else {
      try {
        fn();
      } catch (error) {
        ErrorUtils.reportFatalError(error);
      }
    }
  }

  // MessageQueue installs a global handler to catch all exceptions where JS users can register their own behavior
  // This handler makes all exceptions to be propagated from inside MessageQueue rather than by the VM at their origin
  // This makes stacktraces to be placed at MessageQueue rather than at where they were launched
  // The parameter DebuggerInternal.shouldPauseOnThrow is used to check before catching all exceptions and
  // can be configured by the VM or any Inspector
  __shouldPauseOnThrow() {
    return (
      // $FlowFixMe
      typeof DebuggerInternal !== 'undefined' &&
      DebuggerInternal.shouldPauseOnThrow === true // eslint-disable-line no-undef
    );
  }

  __callImmediates() {
    Systrace.beginEvent('JSTimers.callImmediates()');
    if (this._immediatesCallback != null) {
      this._immediatesCallback();
    }
    Systrace.endEvent();
  }

  __callFunction(module: string, method: string, args: any[]): any {
    // 更新最新刷新时间
    this._lastFlush = Date.now();
    // 更新事件循环开始事件
    this._eventLoopStartTime = this._lastFlush;
    if (__DEV__ || this.__spy) {
      Systrace.beginEvent(`${module}.${method}(${stringifySafe(args)})`);
    } else {
      Systrace.beginEvent(`${module}.${method}(...)`);
    }
    if (this.__spy) {
      this.__spy({type: TO_JS, module, method, args});
    }

    // **重要** 获取到对应的模块
    const moduleMethods = this.getCallableModule(module);
    invariant(
      !!moduleMethods,
      'Module %s is not a registered callable module (calling %s)',
      module,
      method,
    );
    invariant(
      !!moduleMethods[method],
      'Method %s does not exist on module %s',
      method,
      module,
    );

    // **重要** 执行具体模块的函数
    const result = moduleMethods[method].apply(moduleMethods, args);
    Systrace.endEvent();
    return result;
  }

  __invokeCallback(cbID: number, args: any[]) {
    this._lastFlush = Date.now();
    this._eventLoopStartTime = this._lastFlush;

    // The rightmost bit of cbID indicates fail (0) or success (1), the other bits are the callID shifted left.
    // eslint-disable-next-line no-bitwise
    const callID = cbID >>> 1;
    // eslint-disable-next-line no-bitwise
    const isSuccess = cbID & 1;
    const callback = isSuccess
      ? this._successCallbacks[callID]
      : this._failureCallbacks[callID];

    if (__DEV__) {
      const debug = this._debugInfo[callID];
      const module = debug && this._remoteModuleTable[debug[0]];
      const method = debug && this._remoteMethodTable[debug[0]][debug[1]];
      if (!callback) {
        let errorMessage = `Callback with id ${cbID}: ${module}.${method}() not found`;
        if (method) {
          errorMessage =
            `The callback ${method}() exists in module ${module}, ` +
            'but only one callback may be registered to a function in a native module.';
        }
        invariant(callback, errorMessage);
      }
      const profileName = debug
        ? '<callback for ' + module + '.' + method + '>'
        : cbID;
      if (callback && this.__spy) {
        this.__spy({type: TO_JS, module: null, method: profileName, args});
      }
      Systrace.beginEvent(
        `MessageQueue.invokeCallback(${profileName}, ${stringifySafe(args)})`,
      );
    }

    if (!callback) {
      return;
    }

    delete this._successCallbacks[callID];
    delete this._failureCallbacks[callID];
    callback(...args);

    if (__DEV__) {
      Systrace.endEvent();
    }
  }
}

module.exports = MessageQueue;
