---
id: architecture
title: Architecture
---

The NPM package has a different code structure because it is compiled with webpack. To follow this page, you need to refer to the GitHub repo instead. 

The `/src/server.ts` file is the executable file that is called when the `tiddlyserver` command is run. It loads the config file, preflighter, and HTTPS options, then passes them all to the `initServer` function in `/src/server/server.ts`. It also sets up an uncaughtException handler to log unhandled errors before exiting. 

This means that TiddlyServer could also be implemented as part of a larger system. The initServer function returns the master instance which handles all the listeners. This can be used to close the server, and then call initServer again to create a new instance. Data folders operate independant of the this, and will maintain their state within the process, allowing the listeners to restart without affecting open data folders. 

For most use cases, however, the preflighter is probably your weapon of choice, allowing you to syphon off requests to handle separately, select a different host from the tree, change the auth account and username applied to the request, and pretty much anything else. To add multiple hosts to a tree, create the following Javascript file and set the path as the tree property in your config.

```js
exports.tree = [
  {} | [], //as many tree objects here as you want, using the hybrid syntax.
  {} | [], //as many tree objects here as you want, using the hybrid syntax.
  {} | [], //as many tree objects here as you want, using the hybrid syntax.
  {} | [], //as many tree objects here as you want, using the hybrid syntax.
];
// This tells the parser to expect an array of hosts. 
// Set this to false to parse the tree as a single host.
exports.multiple = true;
```

This is an interface representing the RequestEvent. It may be used as the TypeScript interface for the request event passed to the preflighter. There are a couple other properties and methods used internally which are not listed here.

<meta charset='utf-8'><div style="color: #000000;background-color: #ffffff;font-family: Menlo, Monaco, 'Courier New', monospace;font-weight: normal;font-size: 12px;line-height: 18px;white-space: pre;"><br><div><span style="color: #af00db;">export</span><span style="color: #000000;"> </span><span style="color: #0000ff;">interface</span><span style="color: #000000;"> </span><span style="color: #267f99;">RequestEvent</span><span style="color: #000000;"> {</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// if this is true after calling the preflighter, no further processing occurs</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">handled</span><span style="color: #000000;">: </span><span style="color: #267f99;">boolean</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// the settings object being applied to this request</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// changing this is not officially supported, but may work</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">settings</span><span style="color: #000000;">: </span><span style="color: #267f99;">ServerConfig</span><span style="color: #000000;">,</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// the HTTP request</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">request</span><span style="color: #000000;">: </span><span style="color: #267f99;">IncomingMessage</span><span style="color: #000000;">,</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// which type of request this is</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">type</span><span style="color: #000000;">: </span><span style="color: #a31515;">"client"</span><span style="color: #000000;"> | </span><span style="color: #a31515;">"response"</span><span style="color: #000000;">,</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// only the one specified in type will be defined</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">client</span><span style="color: #000000;">: </span><span style="color: #267f99;">WebSocket</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">response</span><span style="color: #000000;">: </span><span style="color: #267f99;">ServerResponse</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// the network info for the request</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">network</span><span style="color: #000000;">: { </span></div><div><span style="color: #000000;">    </span><span style="color: #008000;">// listen address passed to the HTTP Server.listen</span></div><div><span style="color: #000000;">    </span><span style="color: #001080;">iface</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;">; </span></div><div><span style="color: #000000;">    </span><span style="color: #008000;">// host header of the request</span></div><div><span style="color: #000000;">    </span><span style="color: #001080;">host</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;"> | </span><span style="color: #267f99;">undefined</span><span style="color: #000000;">; </span></div><div><span style="color: #000000;">    </span><span style="color: #008000;">// local interface address</span></div><div><span style="color: #000000;">    </span><span style="color: #001080;">addr</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;">; </span></div><div><span style="color: #000000;">  };</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// returns the permissions object that applies based </span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// on authAccountKey and localAddressPermissionsKey</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">allow</span><span style="color: #000000;">: </span><span style="color: #267f99;">ServerConfig_AccessOptions</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">//getter that returns the treeHost at treeHostIndex</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">hostRoot</span><span style="color: #000000;">: </span><span style="color: #267f99;">Config</span><span style="color: #000000;">.</span><span style="color: #267f99;">HostElement</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// username for this request, preset if logged in</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">username</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// authAccounts object key that applies to this request</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">authAccountKey</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// bindInfo.localAddressPermissions object key that applies to this request</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">localAddressPermissionsKey</span><span style="color: #000000;">: </span><span style="color: #267f99;">string</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// the host index in the tree</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">treeHostIndex</span><span style="color: #000000;">: </span><span style="color: #267f99;">number</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// the output stream of the debug logger, may be changed or used by the preflighter</span></div><div><span style="color: #000000;">  </span><span style="color: #001080;">debugOutput</span><span style="color: #000000;">: </span><span style="color: #267f99;">Writable</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// resolves the url to determine the tree node this request applies to</span></div><div><span style="color: #000000;">  </span><span style="color: #795e26;">resolvePath</span><span style="color: #000000;">(): </span><span style="color: #267f99;">PathResolverResult</span><span style="color: #000000;"> | </span><span style="color: #267f99;">undefined</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// close the response or client with this code and message</span></div><div><span style="color: #000000;">  </span><span style="color: #795e26;">close</span><span style="color: #000000;">(</span><span style="color: #001080;">code</span><span style="color: #000000;">: </span><span style="color: #267f99;">number</span><span style="color: #000000;">, </span><span style="color: #001080;">message</span><span style="color: #000000;">?: </span><span style="color: #267f99;">string</span><span style="color: #000000;"> | </span><span style="color: #267f99;">undefined</span><span style="color: #000000;">): </span><span style="color: #267f99;">void</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">  </span><span style="color: #008000;">// get the tree options (auth, index, and putsaver) that apply to this tree node</span></div><div><span style="color: #000000;">  </span><span style="color: #795e26;">getTreeOptions</span><span style="color: #000000;">(</span><span style="color: #001080;">result</span><span style="color: #000000;">: </span><span style="color: #267f99;">PathResolverResult</span><span style="color: #000000;">): </span><span style="color: #267f99;">OptionsConfig</span><span style="color: #000000;">;</span></div><div><span style="color: #000000;">}</span></div></div>