/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alarms from "../alarms.js";
import type * as apiKeys from "../apiKeys.js";
import type * as deviceApi from "../deviceApi.js";
import type * as devices from "../devices.js";
import type * as lib_alarmLogic from "../lib/alarmLogic.js";
import type * as lib_alarms from "../lib/alarms.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_shared from "../lib/shared.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mcp from "../mcp.js";
import type * as push from "../push.js";
import type * as pushData from "../pushData.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alarms: typeof alarms;
  apiKeys: typeof apiKeys;
  deviceApi: typeof deviceApi;
  devices: typeof devices;
  "lib/alarmLogic": typeof lib_alarmLogic;
  "lib/alarms": typeof lib_alarms;
  "lib/crypto": typeof lib_crypto;
  "lib/functions": typeof lib_functions;
  "lib/shared": typeof lib_shared;
  "lib/validators": typeof lib_validators;
  mcp: typeof mcp;
  push: typeof push;
  pushData: typeof pushData;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
