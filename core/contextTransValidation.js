// const Ajv = require("ajv");
// const addFormats = require("ajv-formats");
// const ajvErrors = require("ajv-errors");

// const logger = require("../utils/logger").init();
// const { formatted_error } = require("../utils/utils");

// const ajv = new Ajv({
//   allErrors: true,
//   strict: "log",
// });

// // Add formats and custom error messages to Ajv
// addFormats(ajv);
// ajvErrors(ajv);

// // Define the schema for transaction ID validation
// const transactionIdSchema = {
//   type: "object",
//   properties: {
//     context: {
//       type: "object",
//       properties: {
//         transaction_id: { type: "string", minLength: 1, errorMessage: "Transaction ID is required and must be a non-empty string." }
//       },
//       required: ["transaction_id"],
//       additionalProperties: true,
//     }
//   },
//   required: ["context"],
//   additionalProperties: true,
//   errorMessage: {
//     required: {
//       "context.transaction_id": "Transaction ID is required."
//     }
//   }
// };

// /**
//  * Middleware to validate transaction ID.
//  * @param {Object} req - Express request object.
//  * @param {Object} res - Express response object.
//  * @param {Function} next - Express next middleware function.
//  */
// const validateTransactionId = (req, res, next) => {
//   const payload = req.body;
//   const validate = ajv.compile(transactionIdSchema);

//   const valid = validate(payload);
//   if (!valid) {
//     const errorList = validate.errors;
//     const formattedErrors = formatted_error(errorList);
//     logger.error(`Transaction ID validation failed: ${JSON.stringify(formattedErrors)}`);

//     return res.status(400).json({ status: false, errors: formattedErrors });
//   }

//   logger.info(`Transaction ID validation succeeded for Transaction ID: ${payload.context.transaction_id}`);
//   next();
// };

// module.exports = validateTransactionId;


// const Ajv = require("ajv");
// const addFormats = require("ajv-formats");
// const ajvErrors = require("ajv-errors");

// const logger = require("../utils/logger").init();
// const { formatted_error } = require("../utils/utils");

// const ajv = new Ajv({
//   allErrors: true,
//   strict: "log",
// });

// // Add formats and custom error messages to Ajv
// addFormats(ajv);
// ajvErrors(ajv);

// // Define the schema for multiple transaction IDs validation
// const transactionIdsSchema = {
//   type: "object",
//   properties: {
//     context: {
//       type: "object",
//       properties: {
//         transaction_id: { type: "string", minLength: 1, errorMessage: "Transaction ID is required and must be a non-empty string." },
//         secondary_transaction_id: { type: "string", minLength: 1, errorMessage: "Secondary Transaction ID must be a non-empty string." }
//       },
//       required: ["transaction_id"],
//       additionalProperties: true,
//     },
//     anotherContext: {
//       type: "object",
//       properties: {
//         another_transaction_id: { type: "string", minLength: 1, errorMessage: "Another Transaction ID must be a non-empty string." }
//       },
//       additionalProperties: true,
//     }
//   },
//   additionalProperties: true,
//   errorMessage: {
//     required: {
//       "context.transaction_id": "Transaction ID is required."
//     }
//   }
// };

// /**
//  * Middleware to validate multiple transaction IDs.
//  * @param {Object} req - Express request object.
//  * @param {Object} res - Express response object.
//  * @param {Function} next - Express next middleware function.
//  */
// const validateTransactionIds = (req, res, next) => {
//   const payload = req.body;
//   const validate = ajv.compile(transactionIdsSchema);

//   const valid = validate(payload);
//   if (!valid) {
//     const errorList = validate.errors;
//     const formattedErrors = formatted_error(errorList);
//     logger.error(`Transaction IDs validation failed: ${JSON.stringify(formattedErrors)}`);

//     return res.status(400).json({ status: false, errors: formattedErrors });
//   }

//   logger.info(`Transaction IDs validation succeeded for Transaction ID: ${payload.context.transaction_id}`);
//   if (payload.context.secondary_transaction_id) {
//     logger.info(`Secondary Transaction ID: ${payload.context.secondary_transaction_id}`);
//   }
//   if (payload.anotherContext && payload.anotherContext.another_transaction_id) {
//     logger.info(`Another Transaction ID: ${payload.anotherContext.another_transaction_id}`);
//   }
//   next();
// };

// module.exports = validateTransactionIds;
async function compareTransaction(example, attribute, example_sets, type) {
  let errors = [];

  for (const key in example) {
    if (key !== "tags") {
      if (typeof example[key] === "object" && typeof attribute[key] === "object") {
        if (!attribute[key]) {
          console.log(`null value found for ${key} in ${example_sets}`);
          errors.push(`null value found for ${key} in ${example_sets}`);
        } else if (Array.isArray(example[key])) {
          for (let i = 0; i < example[key]?.length; i++) {
            const exampleItem = example[key][i];
            const attributeItem = attribute[key];
            if (typeof exampleItem === "object" && typeof attributeItem === "object") {
              const err = await compareTransaction(exampleItem, attributeItem, example_sets, type);
              errors = [...errors, ...err];
            } else if (typeof exampleItem === "string" && attributeItem && key === type) {
              if (exampleItem !== attributeItem) {
                console.log(`${type} mismatch for ${key} in ${example_sets}: Expected ${attributeItem}, Received ${exampleItem}`);
                errors.push(`${type} mismatch for ${key} in ${example_sets}: Expected ${attributeItem}, Received ${exampleItem}`);
              }
            } else {
              const err = await compareTransaction(exampleItem, attributeItem, example_sets, type);
              errors = [...errors, ...err];
            }
          }
        } else if (typeof example[key] === "string" && typeof attribute[key] === "string" && key === type) {
          if (example[key] !== attribute[key]) {
            console.log(`${type} mismatch for ${key} in ${example_sets}: Expected ${attribute[key]}, Received ${example[key]}`);
            errors.push(`${type} mismatch for ${key} in ${example_sets}: Expected ${attribute[key]}, Received ${example[key]}`);
          }
        } else {
          const err = await compareTransaction(example[key], attribute[key], example_sets, type);
          errors = [...errors, ...err];
        }
      } else if (!attribute.hasOwnProperty(key)) {
        console.log(`keys not found, ${key} in ${example_sets}`);
        errors.push(`keys not found, ${key} in ${example_sets}`);
      }
    }
  }

  return errors;
}

module.exports = { compareTransaction };
