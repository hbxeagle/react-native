/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const babelRegisterOnly = require('metro-babel-register');

const BABEL_ENABLED_PATHS = ['local-cli'];

/**
 * Centralized place to register all the directories that need a Babel
 * transformation before being fed to Node.js. Notably, this is necessary to
 * support Flow type annotations.
 */
/**
 * 集中放置所有需要Babel转换的目录，
 * 然后再送到Node.js.
 * 值得注意的是，这对于支持Flow类型注释是必要的。
 */
function setupBabel() {
  babelRegisterOnly(
    babelRegisterOnly.buildRegExps(__dirname, BABEL_ENABLED_PATHS),
  );
}

module.exports = setupBabel;
