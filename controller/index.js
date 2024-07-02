const axios = require("axios");
const router = require("express").Router();
const {
  createBecknObject,
  extractBusinessData,
} = require("../core/mapper_core");
const {
  insertSession,
  getSession,
  generateSession,
  findSession,
} = require("../core/session");
const { generateHeader, verifyHeader } = require("../core/auth_core");
const { cache } = require("../core/cache");
const { parseBoolean, jsonout } = require("../utils/utils");
const IS_VERIFY_AUTH = parseBoolean(process.env.IS_VERIFY_AUTH);
const IS_SYNC = parseBoolean(process.env.BUSINESS_SERVER_IS_SYNC);

const validateSchema = require("../core/schema");
const SERVER_TYPE = process.env.SERVER_TYPE;
const PROTOCOL_SERVER = process.env.PROTOCOL_SERVER;
const logger = require("../utils/logger").init();
const { signNack, errorNack, ack } = require("../utils/responses");
const { dynamicReponse, dynamicFlow } = require("../core/operations/main");
const { configLoader } = require("../core/loadConfig");
const { comapreObjects } = require("../core/attributeValidation");

const ASYNC_MODE = "ASYNC";
const SYNC_MODE = "SYNC";

const getsession = async (req,res)=>{
  res.send(await cache.get())
 }
 
const becknToBusiness = (req, res) => {
  const body = req.body;
  const transaction_id = body?.context?.transaction_id;
  const config = body.context.action;

  validateIncommingRequest(body, transaction_id, config, res);
};

const validateIncommingRequest = async (body, transaction_id, config, res) => {
  try {
    if (IS_VERIFY_AUTH !== false) {
      if (!(await verifyHeader(body))) {
        return res.status(401).send(signNack);
      }
    }

    let session = null;
    let sessionId = null;

    // beckn-payload incoming 
    // only difference is create session for seller but give error for buyer
    if (SERVER_TYPE === "BPP") {
      session = await getSession(transaction_id);

      const configObject = configLoader.getConfig();
      
      if(!session?.configName){
        configName = dynamicFlow(
          body,
          configObject[SERVER_TYPE]["flow_selector"][config]
        )
      }
     

      if (!session) {
        const sessionObject = {
          version: body.context.version,
          country: body?.context?.location?.country?.code,
          cityCode: body?.context?.location?.city?.code,
          configName: configName || process.env.flow,
          transaction_id: transaction_id
      }
        await generateSession(sessionObject);
        session = await getSession(transaction_id);
        const buyer_mock_transactionids = await axios.get(`${process.env.BACKEND_SERVER_URL}/cache`)
        if(buyer_mock_transactionids?.data.length ===0 || !buyer_mock_transactionids?.data?.includes(transaction_id)){
        const result =   await axios.post(`${process.env.BACKEND_SERVER_URL}/mapper/session`,sessionObject)
        console.log(result)
        }
      }
    } else {

      // DIFFERENCE in buyer mode 
      session = await findSession(body);

      if (!session) {
        console.log("No session exists");
        return res.status(500).send(errorNack);
      }
    }

    console.log("schema>", JSON.stringify(body));

    const schemaConfig = configLoader.getSchema(session.configName);

    if (schemaConfig[config]) {
      const schema = schemaConfig[config];
      const schemaValidation = await validateSchema(body, schema);

      if (!schemaValidation?.status) {
        return res.status(400).send(schemaValidation.message);
      }
    } else {
      logger.info(`Schema config missing for ${config}`);
    }

    const attributeConfig = configLoader.getAttributeConfig(session.configName);

    if (attributeConfig) {
      const attrErrors = comapreObjects(body, attributeConfig[config], config);

      if (attrErrors.length) {
        logger.error("Attribute validation failded: " + attrErrors);
        return res.status(400).send(attrErrors);
      }
    } else {
      logger.info(`Attribute config missing for ${session.configName}`);
    }

    logger.info("Recieved request: " + JSON.stringify(body?.context));
    res.send(ack);
    handleRequest(body, session, sessionId);
  } catch (err) {
    console.log(err?.data?.message || err);
  }
};

const handleRequest = async (response, session, sessionId) => {
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

    // if (is_buyer || session.ui) {
    // if (is_buyer || 1) {

      let config = null;
      let isUnsolicited = true;

      // if call is unsolicated
      session.calls.map((call) => { // sare configs se match krrha h this step won't be necessary 
        if (call.callback?.message_id === response.context.message_id || call.unsolicated === false) {
          config = call.callback?.config;
          isUnsolicited = false;
        }
      });

      if (isUnsolicited) {
        config = action;
      }

      console.log("config >>>>>", config);

      const protocol = configLoader.getMapping(session.configName)[config];
      if(protocol == undefined){
        throw new Error("Protocol  is undefined")
      }
      const { result: businessPayload, session: updatedSession } =
        extractBusinessData(action, response, session, protocol);

      let urlEndpint = null;
      let mode = ASYNC_MODE;

      // search , on_search etc map 
      // storing payload and endpoint nikalra h kidhar hit krna h 
      const updatedCalls = updatedSession.calls.map((call) => {
        // unsolicated check if message id not found
        if (isUnsolicited && call.callback.config === action) {
          call.callback.unsolicited = [
            ...(call.callback.unsolicited || []),
            response,
          ];
          urlEndpint = call.callback.unsolicitedEndpoint;
        }

        if (call.callback?.message_id === response.context.message_id || call.unsolicated === false) {
          call.callback.becknPayload = [
            ...(call.callback.becknPayload || []), // storing payload
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
          businessPayload, // minified response of response || extract method in buyer mock works on this payload extracts from business payload
          updatedSession, // request ayi session data kuch value update kii to buyer mock m sync krne  k liye 
          messageId, // message id <omit>
          sessionId, // protocol server ki transaction id useless <omit>
          response, // response network se aya h || copy payload krke functionality h agr user full payload dekhna chahta h 
        });
      }
    // } else {

    //   const protocol = configLoader.getMapping(session.configName)[action];

    //   // session.calls.find((data)=> )

    //   // select url at which response should be sent
    //   let { callback, serviceUrl, sync } = dynamicReponse(
    //     response,
    //     session.api[action]
    //   );

    //   callback = callback ? callback : action;

    //   const { payload: becknPayload, session: updatedSession } =
    //     createBecknObject(session, action, response, protocol);
    //   insertSession(updatedSession);
    //   let url;
    //   if (serviceUrl !== undefined) {
    //     url = `${process.env.BACKEND_SERVER_URL}${serviceUrl}`;
    //   } else {
    //     url = `${process.env.BACKEND_SERVER_URL}/${callback}`;
    //   }
    //   const mockResponse = await axios.post(`${url}`, {businessPayload:becknPayload,updatedSession:session,messageId:messageId, response:response});
    //   if (mockResponse)
    //     if (sync) {
    //       businessToBecknMethod(mockResponse.data);
    //     }
    // }
    // throw new Error("an error occurred")
  } catch (e) {
    console.log(e);
    logger.error(JSON.stringify(e));
  }
};

const businessToBecknWrapper = async (req, res) => {
  try {
    const body = req.body;
    const { status, message, code } = await businessToBecknMethod(body);
    if (message?.updatedSession?.schema) {
      delete message.updatedSession.schema;
    }
    res.status(code).send({ status: status, message: message });
  } catch (e) {
    console.log(">>>>>", e);
    res.status(500).send({ error: true, message: e?.message || e });
  }
};

// incoming business payload 


const businessToBecknMethod = async (body) => {
  logger.info("inside businessToBecknMethod controller: ");

  try {
    //except target i can fetch rest from my payload
    let { type, config, data, transactionId, target, configName,ui } = body;
    let seller =SERVER_TYPE === "BPP"? true: false;
    if (SERVER_TYPE === "BPP" && !ui) { // if request is coming mapping is being done like actual ondc payload while bap protocol server is using different paths and 
      (data = body),
        (transactionId = data.context.transaction_id) ||  data.transactionId,
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

      session = { ...session, ...data };
    

    ////////////// session validation ////////////////////

    // const protocol = mapping[session.configName][config];
    // const protocol = session.protocol[config];
    console.log(config,"---> config")
    const protocol = configLoader.getMapping(session.configName)[config];

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

    //////////////////// SEND TO NETWORK /////////////////////////

    /// UPDTTED CALLS ///////

    let mode = null;
    // DIFFERENCE calls config is being updated
    // message_id store krne k liye nd beckn payload
    if (SERVER_TYPE === "BAP" || ui) {
      const updatedCalls = updatedSession.calls.map((call) => {
        const message_id = becknPayload.context.message_id;
        if (call.config === config) {
          // call.message_id = message_id;
          call.becknPayload = becknPayload;
          mode = call?.mode || ASYNC_MODE;
          call.callback.message_id = message_id;
        }
        // if (call.config === `on_${config}`) {
        //   call.message_id = message_id;
        // }
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

          // sync mode case 
          newSession.calls.map((call) => {
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
  } catch (e) {
    console.log(">>>>>", e?.message, e);
    return { status: "Error", message: errorNack, code: 500 };
    //   res.status(500).send(errorNack);
  }
};

const updateSession = async (req, res) => {
  const { sessionData, transactionId } = req.body;
  if (!sessionData || !transactionId) {
    return res
      .status(400)
      .send({ message: "session Data || transcationID required" });
  }

  session = await getSession(transactionId);

  if (!session) {
    return res.status(400).send({ message: "No session found" });
  }

  insertSession({ ...session, ...sessionData });

  res.send({ message: "session updated" });
};

module.exports = {
  becknToBusiness,
  businessToBecknMethod,
  businessToBecknWrapper,
  updateSession,getsession
};
