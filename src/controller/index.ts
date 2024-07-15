import axios from "axios";
const router = require("express").Router();
import { createBecknObject, extractBusinessData } from "../core/mapper_core";
import {
  insertSession,
  getSession,
  generateSession,
  findSession,
} from "../core/session";
import { generateHeader, verifyHeader } from "../core/auth_core";
import { cache } from "../core/cache";
import { parseBoolean, jsonout, buildNackPayload } from "../utils/utils";
const IS_VERIFY_AUTH = parseBoolean(process.env.IS_VERIFY_AUTH);
const IS_SYNC = parseBoolean(process.env.BUSINESS_SERVER_IS_SYNC);

import { validateSchema } from "../core/schema";
const SERVER_TYPE = process.env.SERVER_TYPE;
const PROTOCOL_SERVER = process.env.PROTOCOL_SERVER;
const logger = require("../utils/logger").init();
import { signNack, errorNack, ack } from "../utils/responses";
import { dynamicReponse, dynamicFlow } from "../core/operations/main";
import { configLoader } from "../core/loadConfig";
import validateAttributes from "../core/attributeValidation";
import { Request, Response } from "express";

const ASYNC_MODE = "ASYNC";
const SYNC_MODE = "SYNC";

export const becknToBusiness = (req: Request, res: Response) => {
  const body = req.body;
  const transaction_id = body?.context?.transaction_id;
  const config = body.context.action;

  validateIncommingRequest(body, transaction_id, config, res);
};

const validateIncommingRequest = async (
  body: Record<string, any>,
  transaction_id: string,
  config: any,
  res: Response
) => {
  try {
    if (IS_VERIFY_AUTH !== false) {
      if (!(await verifyHeader(body))) {
        return res.status(401).send(signNack);
      }
    }

    let session = null;
    let sessionId = null;

    if (SERVER_TYPE === "BPP") {
      session = await getSession(transaction_id);

      const configObject = configLoader.getConfig();
      const configName = dynamicFlow(
        body,
        configObject[SERVER_TYPE]["flow_selector"][config]
      );

      if (!session) {
        await generateSession({
          version: body.context.version,
          country: body?.context?.location?.country?.code,
          cityCode: body?.context?.location?.city?.code,
          configName: configName || process.env.flow,
          transaction_id: transaction_id,
        });
        session = await getSession(transaction_id);
      }
    } else {
      session = await findSession(body);

      if (!session) {
        console.log("No session exists");
        return res.status(200).send(errorNack);
      }
    }

    logger.info("Recieved request: " + JSON.stringify(body));

    // const schemaConfig = configLoader.getSchema(session.configName);
    const schemaConfig = configLoader.getSchema();

    if (schemaConfig[config]) {
      const schema = schemaConfig[config];
      const schemaValidation = await validateSchema(body, schema);

      if (!schemaValidation?.status && schemaValidation?.message) {
        return res.status(200).send(buildNackPayload(schemaValidation.message));
      }
    } else {
      logger.info(`Schema config missing for ${config}`);
    }

    const attributeConfig = configLoader.getAttributeConfig(session.configName);

    if (attributeConfig) {
      const attrErrors = validateAttributes(
        body,
        attributeConfig[config],
        config
      );

      if (attrErrors.length) {
        logger.error("Attribute validation failed: " + attrErrors);
        // return res
        //   .status(200)
        //   .send(buildNackPayload(JSON.stringify(attrErrors)));
      } else {
        logger.info("Attribute validation SUCCESS");
      }
    } else {
      logger.info(`Attribute config missing for ${session.configName}`);
    }

    res.send(ack);
    handleRequest(body, session, sessionId ?? "");
  } catch (err: any) {
    console.log(err?.data?.message || err);
  }
};

const handleRequest = async (
  response: any,
  session: any,
  sessionId: string
) => {
  try {
    const action = response?.context?.action;
    const messageId = response?.context?.message_id;
    const is_buyer = SERVER_TYPE === "BAP" ? true : false;
    if (!action) {
      return console.log("Action not defined");
    }

    if (!messageId) {
      return console.log("Message ID not defined");
    }

    if (is_buyer) {
      let config = null;
      let isUnsolicited = true;

      session.calls.map((call: any) => {
        if (call.callback?.message_id?.includes(response.context.message_id)) {
          config = call.callback?.config;
          isUnsolicited = false;
        }
      });

      if (isUnsolicited) {
        config = action;
      }

      console.log("config >>>>>", config);

      const mapping = configLoader.getMapping(session.configName);
      const protocol = mapping ? mapping[config] : null;

      const { result: businessPayload, session: updatedSession } =
        extractBusinessData(action, response, session, protocol);

      businessPayload.context = {};
      businessPayload.context.message_id = response.context.message_id;

      let urlEndpint = null;
      let mode = ASYNC_MODE;

      const updatedCalls = updatedSession.calls.map((call: any) => {
        if (isUnsolicited && call.callback.config === action) {
          call.callback.unsolicited = [
            ...(call.callback.unsolicited || []),
            response,
          ];
          urlEndpint = call.callback.unsolicitedEndpoint;
        }

        if (call.callback?.message_id?.includes(response.context.message_id)) {
          call.callback.becknPayload = [
            ...(call.callback.becknPayload || []),
            response,
          ];
          call.callback.businessPayload = [
            ...(call.callback.businessPayload || []),
            businessPayload,
          ];
          urlEndpint = call.callback.endpoint;
          mode = call?.mode || ASYNC_MODE;
        }

        return call;
      });

      updatedSession.calls = updatedCalls;

      insertSession(updatedSession);

      if (updatedSession?.schema) {
        delete updatedSession.schema;
      }

      logger.info("mode>>>>>>>>> " + mode);
      if (mode === ASYNC_MODE) {
        await axios.post(`${process.env.BACKEND_SERVER_URL}/${urlEndpint}`, {
          businessPayload,
          updatedSession,
          messageId,
          sessionId,
          response,
        });
      }
    } else {
      const mapping = configLoader.getMapping(session.configName);
      const protocol = mapping ? mapping[action] : null;

      let { callback, serviceUrl, sync } = dynamicReponse(
        response,
        session.api[action]
      );
      callback = callback ? callback : action;

      const { payload: becknPayload, session: updatedSession } =
        createBecknObject(session, action, response, protocol);
      insertSession(updatedSession);
      let url;
      if (serviceUrl !== undefined) {
        url = `${process.env.BACKEND_SERVER_URL}${serviceUrl}`;
      } else {
        url = `${process.env.BACKEND_SERVER_URL}/${callback}`;
      }
      const mockResponse = await axios.post(`${url}`, becknPayload);
      if (mockResponse)
        if (sync) {
          businessToBecknMethod(mockResponse.data);
        }
    }
    // throw new Error("an error occurred")
  } catch (e) {
    console.log(e);
    logger.error(JSON.stringify(e));
  }
};

export const businessToBecknWrapper = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const { status, message, code } = (await businessToBecknMethod(
      body
    )) as any;
    if (message?.updatedSession?.schema) {
      delete message.updatedSession.schema;
    }
    res.status(code).send({ status: status, message: message });
  } catch (e: any) {
    console.log(">>>>>", e);
    res.status(500).send({ error: true, message: e?.message || e });
  }
};

export const businessToBecknMethod = async (body: any) => {
  body = body ? body : {};
  logger.info("inside businessToBecknMethod controller: ", body);
  try {
    //except target i can fetch rest from my payload
    let { type, config, data, transactionId, target, configName } = body;
    let seller = false;
    if (SERVER_TYPE === "BPP") {
      (data = body),
        (transactionId = data.context.transaction_id),
        (type = data.context.action),
        (config = type);
      seller = true;
    }

    let session = body.session;

    ////////////// session validation ////////////////////
    if (session && session.createSession && session.data) {
      await generateSession({
        country: session.data.country,
        cityCode: session.data.cityCode,
        bpp_id: session.data.bpp_id,
        configName: configName,
        transaction_id: transactionId,
      });
      session = await getSession(transactionId);
    } else {
      session = await getSession(transactionId); // session will be premade with beckn to business usecase

      if (!session) {
        return {
          status: "Bad Request",
          message: "session not found",
          code: 400,
        };
        //   return res.status(400).send({ error: "session not found" }); ------->
      }
    }

    if (SERVER_TYPE === "BAP") {
      session = { ...session, ...data };
    }

    ////////////// session validation ////////////////////

    // const protocol = mapping[session.configName][config];
    // const protocol = session.protocol[config];
    const mapping = configLoader.getMapping(session.configName);
    const protocol = mapping ? mapping[config] : null;

    ////////////// MAPPING/EXTRACTION ////////////////////////

    const { payload: becknPayload, session: updatedSession } =
      createBecknObject(session, type, data, protocol);

    if (!seller) {
      becknPayload.context.bap_uri = `${process.env.SUBSCRIBER_URL}/ondc`;
    }
    // else {
    //   becknPayload.context.bpp_uri = "http://localhost:5500/ondc/";
    // }

    let url;

    const GATEWAY_URL = process.env.GATEWAY_URL;

    if (target === "GATEWAY") {
      url = GATEWAY_URL;
    } else {
      url =
        SERVER_TYPE === "BPP"
          ? becknPayload.context.bap_uri
          : becknPayload.context.bpp_uri;
    }

    if (!url && type != "search") {
      return {
        status: "Bad Request",
        message: "callback url not provided",
        code: 400,
      };
      // return res.status(400).send({message:"callback url not provided",success: false})  ---->
    }
    if (url[url.length - 1] != "/") {
      //"add / if not exists in bap uri"
      url = url + "/";
    }

    ////////////// MAPPING/EXTRACTION ////////////////////////

    /////////////////// AUTH/SIGNING /////////////////

    const signedHeader = await generateHeader(becknPayload);

    /////////////////// AUTH/SIGNING /////////////////

    const header = { headers: { Authorization: signedHeader } };

    //////////////////// SEND TO NETWORK /////////////////////////
    const response = await axios.post(`${url}${type}`, becknPayload, header);
    console.log("response: ", response.data);
    //////////////////// SEND TO NETWORK /////////////////////////

    /// UPDTTED CALLS ///////

    let mode = null;
    if (SERVER_TYPE === "BAP") {
      const updatedCalls = updatedSession.calls.map((call: any) => {
        const message_id = becknPayload.context.message_id;
        if (call.config === config) {
          // call.message_id = message_id;
          call.becknPayload = [...(call?.becknPayload || []), becknPayload];
          mode = call?.mode || ASYNC_MODE;
          call.callback.message_id = [
            ...(call.callback?.message_id || []),
            message_id,
          ];
        }

        return call;
      });

      updatedSession.calls = updatedCalls;
    }

    /// UPDTTED CALLS ///////

    insertSession(updatedSession);

    logger.info("mode::::::::: " + mode);
    if (mode === SYNC_MODE) {
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          const newSession = await getSession(transactionId);
          let businessPayload = null;
          let onBecknPayload = null;

          newSession.calls.map((call: any) => {
            if (call.config === config) {
              businessPayload = call.callback.businessPayload;
              onBecknPayload = call.callback.becknPayload;
            }
          });

          const becknPayloads = {
            action: becknPayload,
            on_action: onBecknPayload,
          };

          if (!businessPayload) {
            reject("Response timeout");
          }

          resolve({
            status: "true",
            message: {
              updatedSession: newSession,
              becknPayload: becknPayloads,
              businessPayload,
            },
            code: 200,
          });
        }, 3000);
      });
    } else {
      return {
        status: "true",
        message: {
          updatedSession,
          becknPayload,
          becknReponse: response.data,
        },
        code: 200,
      };
      // res.send({ updatedSession, becknPayload, becknReponse: response.data });
    }
  } catch (e: any) {
    console.log(">>>>>", e?.message, e);
    return { status: "Error", message: errorNack, code: 500 };
    //   res.status(500).send(errorNack);
  }
};

export const updateSession = async (req: Request, res: Response) => {
  const { sessionData, transactionId } = req.body;
  if (!sessionData || !transactionId) {
    return res
      .status(400)
      .send({ message: "session Data || transcationID required" });
  }

  const session = await getSession(transactionId);

  if (!session) {
    return res.status(400).send({ message: "No session found" });
  }

  insertSession({ ...session, ...sessionData });

  res.send({ message: "session updated" });
};

// module.exports = {
//   becknToBusiness,
//   businessToBecknMethod,
//   businessToBecknWrapper,
//   updateSession,
// };
