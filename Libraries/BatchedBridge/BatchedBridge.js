/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

const MessageQueue = require('MessageQueue');

const BatchedBridge = new MessageQueue();

// Wire up the batched bridge on the global object so that we can call into it.
// Ideally, this would be the inverse relationship. I.e. the native environment
// provides this global directly with its script embedded. Then this module
// would export it. A possible fix would be to trim the dependencies in
// MessageQueue to its minimal features and embed that in the native runtime.

// 连接到全局对象上的批处理桥，以便我们可以调用它。
// 理想情况下，这将是反向关系。即原生环境直接为全局提供嵌入的脚本。
// 然后这个模块将导出它。
// 一个可能的解决方法是将MessageQueue中的依赖项修剪为其最小特性，
// 并将其嵌入到原生运行时中。

Object.defineProperty(global, '__fbBatchedBridge', {
  configurable: true,
  value: BatchedBridge,
});

module.exports = BatchedBridge;
