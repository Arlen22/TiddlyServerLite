import {
  PathResolverResult,
  // RequestEventWS,
  resolvePath,
  ServerConfig,
  ServerEventEmitter,
  // StateObject,
  statWalkPath,
  tryParseJSON,
  StatPathResult,
  IStatPathResult,
  Resolved,
  getStatPathResult,
} from "./server-types";
import { StateObject } from "./state-object";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";

import { EventEmitter } from "./event-emitter-types";
import { parse } from "url";
import { inspect, promisify } from "util";
import { WikiInfo } from "./boot-startup-types";
import * as WebSocket from "ws";
import { RequestEvent } from "./request-event";
import { OptionsConfig } from "./server-config";

interface Records<T> { [k: string]: T; }

const loadedFolders: Records<DataFolder> = {};
const otherSocketPaths: Records<WebSocket[]> = {};
const clientsList: Records<WebSocket[]> = {};
// let eventer: ServerEventEmitter;

type DataFolderEvents = {
  "ws-client-connect": readonly [WebSocket, DataFolderRequest, string]
  "ws-client-preload": readonly [() => void]
  "reload": readonly any[]
}
export function handleDataFolderRequest(
  result: PathResolverResult,
  state: import("./tiddlyserver").TreeStateObject<getStatPathResult<"datafolder">>
) {
  const reload = !!state.url.query.reload;
  let request = new DataFolderRequest(
    result,
    state.statPath,
    state.url.pathname,
    state.settings.__targetTW,
    state.settings.datafolder,
  );
  DataFolder.trigger(request, reload);
  const { mount } = request;
  const isFullpath = result.filepathPortion.length === state.statPath.index;
  // if we are at the datafolder root, we need to correctly set the trailing slash based on user preference
  const redirect = isFullpath && state.pathOptions.noTrailingSlash !== !state.url.pathname.endsWith("/");
  //set the trailing slash correctly if this is the actual page load
  //redirect ?reload requests to the same, to prevent it being
  //reloaded multiple times for the same page load.
  if (redirect || reload) {
    let redirect = mount + (!state.pathOptions.noTrailingSlash ? "/" : "");
    state.redirect(redirect)
    return;
  }
  loadedFolders[mount].handler(state);
}
class DataFolder {
  /** Creates a DataFolder if there is none on loadedFolders[mount] then loads the datafolder asyncly */
  static trigger(request: DataFolderRequest, reloadParam: boolean) {
    let { mount, folder, target, vars } = request;
    //initialize the tiddlywiki instance
    if (!loadedFolders[mount] || reloadParam) {
      if (reloadParam) loadedFolders[mount].events.emit("reload");
      loadedFolders[mount] = new DataFolder(mount, folder);
      promisify(fs.readFile)(path.join(folder, "tiddlywiki.info"), "utf8").then(data => {
        const wikiInfo = tryParseJSON<WikiInfo>(data, e => { throw e; });
        if (!wikiInfo.type || wikiInfo.type === "tiddlywiki") {
          loadDataFolderTiddlyWiki(mount, folder, target, vars);
        }
      });
    }
  }
  pending: StateObject[] = [];
  events = new EventEmitter<DataFolderEvents>();
  handler: (state: StateObject) => void = (state) => { this.pending.push(state); }
  constructor(
    public mount: string,
    public folder: string
  ) {

  }
}

class DataFolderRequest {
  mount: string;
  folder: string;
  constructor(
    public result: PathResolverResult,
    public statPath: getStatPathResult<"datafolder">,
    public pathname: string,
    public target: string,
    public vars: {}
  ) {
    let filepathPrefix = this.result.filepathPortion.slice(0, this.statPath.index).join("/");
    //get the tree path, and add the file path (none if the tree path is a datafolder)
    let fullPrefix = ["", this.result.treepathPortion.join("/")];
    if (this.statPath.index > 0) fullPrefix.push(filepathPrefix);
    //join the parts and split into an array
    fullPrefix = fullPrefix.join("/").split("/");
    //use the unaltered path in the url as the tiddlywiki prefix
    this.mount = this.pathname.split("/").slice(0, fullPrefix.length).join("/");
    //get the full path to the folder as specified in the tree
    this.folder = this.statPath.statpath;
  }
}

export async function handleWebsocketConnection(
  data: RequestEvent,
  result: PathResolverResult,
  treeOptions: OptionsConfig,
  statPath: StatPathResult
) {
  const { client, settings, debugOutput } = data;
  const debug = StateObject.DebugLogger("WEBSOCK").bind({ settings, debugOutput });
  let pathname = parse(data.request.url as string).pathname;
  if (!pathname) return client.close(400);

  if (statPath.itemtype === "datafolder") {
    if (!data.allow.datafolder) return client.close(403);
    //trigger the datafolder to load in case it isn't
    const request = new DataFolderRequest(
      result,
      statPath,
      pathname,
      settings.__targetTW,
      settings.datafolder
    );
    const { mount, folder } = request;
    const subpath = pathname.slice(mount.length);
    //event to give the client to the data folder
    const loadClient = () => {
      debug(-1, "ws-client-connect %s", mount);
      loadedFolders[mount].events.emit("ws-client-connect", client, request, subpath);
    };
    //if the data folder is still loading, we wait, otherwise give immediately
    if (Array.isArray(loadedFolders[mount].handler)) {
      loadedFolders[mount].events.once("ws-client-preload", loadClient);
    } else {
      loadClient();
    }
  } else {
    console.log("add client", pathname);

    client.addEventListener("message", event => {
      // console.log("message", event.data);
      debug(-3, "WS-MESSAGE %s", inspect(event.data));
      clientsList[pathname as string].forEach(e => {
        if (e !== client) e.send(event.data);
      });
    });

    client.addEventListener("error", event => {
      debug(-2, "WS-ERROR %s %s", pathname, event.type);
      let index = clientsList[pathname as string].indexOf(client);
      if (index > -1) clientsList[pathname as string].splice(index, 1);
      client.close();
    });

    client.addEventListener("close", event => {
      debug(-2, "WS-CLOSE %s %s %s", pathname, event.code, event.reason);
      let index = clientsList[pathname as string].indexOf(client);
      if (index > -1) clientsList[pathname as string].splice(index, 1);
    });

    if (!clientsList[pathname]) clientsList[pathname] = [];
    clientsList[pathname].push(client);
  }
}

declare const __non_webpack_require__: NodeRequire | undefined;
const nodeRequire =
  typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require;

function loadDataFolderTiddlyWiki(
  mount: string,
  folder: string,
  target: string,
  vars: {}
) {
  console.time("twboot-" + folder);
  let _wiki = undefined;

  const tw = nodeRequire(target + "/boot/boot.js").TiddlyWiki(
    nodeRequire(target + "/boot/bootprefix.js").bootprefix({
      packageInfo: nodeRequire(target + "/package.json"),
    })
  );

  tw.boot.argv = [folder];
  tw.preloadTiddler({
    text: "$protocol$//$host$" + mount + "/",
    title: "$:/config/tiddlyweb/host",
  });

  try {
    tw.boot.boot(() => {
      complete(null, tw);
    });
  } catch (err) {
    complete(err, null);
  }

  function complete(err, $tw) {
    console.timeEnd("twboot-" + folder);
    if (err) {
      return console.log(mount, folder, err);
    }

    //we use $tw.modules.execute so that the module has its respective $tw variable.
    let Server: typeof TiddlyWikiServer;
    try {
      Server = $tw.modules.execute("$:/core/modules/server/server.js").Server;
    } catch (e) {
      console.log(mount, folder, e);
      return;
    }
    let server = new Server({
      wiki: $tw.wiki,
      variables: {
        "path-prefix": mount,
        "root-tiddler": "$:/core/save/all",
        gzip: "yes",
        // "root-tiddler": "$:/core/save/all-external-js"
        ...vars,
      },
    });
    // server.TS_StateObject_Queue = [];
    // server.TS_Request_Queue = [];
    let queue: Record<symbol, StateObject> = {};
    let auth = new TiddlyServerAuthentication(server, (sym: symbol) => {
      let res = queue[sym];
      delete queue[sym];
      return res;
    });
    auth.init();
    server.authenticators.unshift(auth);
    //invoke the server start hook so plugins can extend the server or attach to the event handler
    $tw.hooks.invokeHook(
      "th-server-command-post-start",
      server,
      loadedFolders[mount].events,
      "tiddlyserver"
    );
    // //add the event emitter to the $tw variable
    // $tw.wss = loadedFolders[mount].events;
    //set the request handler, indicating we are now ready to recieve requests
    const requests = loadedFolders[mount].pending;
    loadedFolders[mount].handler = (state: StateObject) => {
      //pretend to the handler like the path really has a trailing slash
      let req = new Object(state.req) as http.IncomingMessage & {
        tsstate: symbol;
      };
      req.url += state.url.pathname === mount && !state.url.pathname.endsWith("/") ? "/" : "";
      req.tsstate = Symbol("state object pointer");
      queue[req.tsstate] = state;
      server.requestHandler(req, state.res);
    };
    //send queued websocket clients to the event emitter
    loadedFolders[mount].events.emit("ws-client-preload");
    //send the queued requests to the handler
    requests.forEach(e => loadedFolders[mount].handler(e));
    loadedFolders[mount].pending = [];
  }
}

function doError(debug, mount, folder, err) {
  debug(3, "error starting %s at %s: %s", mount, folder, err.stack);
  const requests = loadedFolders[mount].pending;
  loadedFolders[mount] = {
    handler: function (state: StateObject) {
      state.respond(500, "TW5 data folder failed").string(
        "The Tiddlywiki data folder failed to load. The error has been " +
        "logged to the terminal with priority level 2. To try again, " +
        "use ?reload=true after making any necessary corrections."
      );
    },
  } as any;
  requests.forEach(e => loadedFolders[mount].handler(e));
}

declare class TiddlyWikiServer {
  addAuthenticator: any;
  authenticators: TiddlyServerAuthentication[];
  requestHandler: (request: http.IncomingMessage, response: http.ServerResponse) => void;
  constructor(...args: any[]);
}
class TiddlyServerAuthentication {
  /**
   *
   * @param server The server instance that instantiated this authenticator
   */
  constructor(private server: TiddlyWikiServer, retrieve: (sym: symbol) => StateObject) {
    //make sure nothing can access the state object!
    this.authenticateRequest = (request, response, state) => {
      let tsstate = retrieve(request.tsstate);
      if (!tsstate.authAccountKey && state.allowAnon) {
        return true;
      } else if (tsstate.authAccountKey) {
        state.authenticatedUsername = tsstate.username;
        return true;
      } else {
        //The wiki itself may specify that anonymous users cannot access it
        tsstate.throwReason(403, "Unauthenticated users cannot access this wiki");
        return false;
      }
    };
  }
  /**
   * Returns true if the authenticator is active, false if it is inactive,
   * or a string if there is an error
   */
  init() {
    return true;
  }
  /**
   * Returns true if the request is authenticated and
   * assigns the "authenticatedUsername" state variable.
   *
   * Returns false if the request couldn't be authenticated,
   * having sent an appropriate response to the browser
   */
  authenticateRequest: (
    request: http.IncomingMessage & { tsstate: symbol },
    response: http.ServerResponse,
    state
  ) => boolean;
}

// import { TreeStateObject } from "./tiddlyserver";