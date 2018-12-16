# day 1

## 目录

package.json
yarn.lock
node_modules

Libraries
React
ReactAndroid
ReactCommon

cli.js
local-cli
react-native-cli
react-native-git-upgrade

React.podspec
third-party
third-party-podspecs

build.gradle
react.gradle
settings.gradle
.gradle
gradle
gradlew
gradlew.bat

lib

scripts

RNTester
IntegrationTests
jest
jest-preset.json
rn-cli.config.js
rn-get-polyfills.js
runXcodeTests.sh

CODE_OF_CONDUCT.md
CONTRIBUTING.md
LICENSE
LICENSE-docs
Releases.md
README.md

template

ContainerShip
DockerTests.md
Jenkinsfile

.appveyor
keystores
.buckconfig
.buckjavaargs
.circleci
.editorconfig
.eslintignore
.eslintrc
.flowconfig
.flowconfig.android
.git
.gitattributes
.github
.gitignore
.nvmrc
bots

flow
flow-github

setupBabel.js
tools

## React Native iOS 启动过程
[RCTRootView initWithBundleURL:...]
[RCTBridge initWithBundleURL:...]
[RCTBridge setUp]
初始化batchedBridge
[RCTCxxBridge start]
开启一个线程jsThread用于js
[RCTCxxBridge _initModulesWithDispatchGroup]
初始化JSCExecutorFactory, 用于执行js代码以及处理回调 JSCExecutor::JSCExecutor()
JSCExecutor::initOnJSVMThread()
installGlobalProxy -> nativeModuleProxy
RCTJavaScriptLoader -> 加载js代码
[RCTCxxBridge executeSourceCode]
[RCTRootView initWithBridge:...]
[RCTRootView bundleFinishedLoading]
初始化RCTRootContentView
[RCTRootView runApplication]//是Native调用js的一个完美例子。本质调用了AppRegistry的runApplication方法