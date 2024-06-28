const fs = require("fs");

const formatted_error = (errors) => {
  error_list = [];
  let status = "";
  errors.forEach((error) => {
    if (
      !["not", "oneOf", "anyOf", "allOf", "if", "then", "else"].includes(
        error.keyword
      )
    ) {
      error_dict = {
        message: `${error.message}${
          error.params.allowedValues ? ` (${error.params.allowedValues})` : ""
        }${error.params.allowedValue ? ` (${error.params.allowedValue})` : ""}${
          error.params.additionalProperty
            ? ` (${error.params.additionalProperty})`
            : ""
        }`,
        details: error.instancePath,
      };
      error_list.push(error_dict);
    }
  });
  if (error_list.length === 0) status = "pass";
  else status = "fail";
  error_json = { errors: error_list, status: status };
  return error_json;
};

function parseBoolean(value) {
  // Convert 'true' to true and 'false' to false
  if (value === "true") {
    return true;
  } else if (value === "false") {
    return false;
  }
  // Return null for other values
  return null;
}

const jsonout = (json, filename) => {
  console.log("json saved to the file");
  const jsonString = JSON.stringify(json, null, 2);
  fs.writeFile(`./compare_temp/${filename}.json`, jsonString, (err, out) => {
    if (err) console.log(err);
    else {
      console.log(out);
    }
  });
};

const buildNackPayload = (msg, code = "346001") => {
  const nack = {
    message: {
      ack: {
        status: "NACK",
      },
    },
    error: {
      code: code,
      message: msg,
    },
  };

  return nack;
};

module.exports = { formatted_error, parseBoolean, jsonout, buildNackPayload };
