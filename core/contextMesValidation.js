async function compareMessageId(examples, attributes, example_sets) {
    let errors = [];
  
    for (const key in examples) {
      if (key !== "tags") {
        if (typeof examples[key] === "object" && typeof attributes[key] === "object") {
          if (!attributes[key]) {
            console.log(`null value found for ${key} in ${example_sets}`);
            errors.push(`null value found for ${key} in ${example_sets}`);
          } else if (Array.isArray(examples[key])) {
            for (let i = 0; i < examples[key]?.length; i++) {
              const exampleItem = examples[key][i];
              const attributeItem = attributes[key];
              if (typeof exampleItem === "object" && typeof attributeItem === "object") {
                const err = await compareMessageId(exampleItem, attributeItem, example_sets);
                errors = [...errors, ...err];
              } else if (typeof exampleItem === "string" && attributeItem && key === "message_id") {
                if (exampleItem !== attributeItem) {
                  console.log(`Message ID mismatch for ${key} in ${example_sets}: Expected ${attributeItem}, Received ${exampleItem}`);
                  errors.push(`Message ID mismatch for ${key} in ${example_sets}: Expected ${attributeItem}, Received ${exampleItem}`);
                }
              } else {
                const err = await compareMessageId(exampleItem, attributeItem, example_sets);
                errors = [...errors, ...err];
              }
            }
          } else if (typeof examples[key] === "string" && typeof attributes[key] === "string" && key === "message_id") {
            if (examples[key] !== attributes[key]) {
              console.log(`Message ID mismatch for ${key} in ${example_sets}: Expected ${attributes[key]}, Received ${examples[key]}`);
              errors.push(`Message ID mismatch for ${key} in ${example_sets}: Expected ${attributes[key]}, Received ${examples[key]}`);
            }
          } else {
            const err = await compareMessageId(examples[key], attributes[key], example_sets);
            errors = [...errors, ...err];
          }
        } else if (!attributes.hasOwnProperty(key)) {
          console.log(`keys not found, ${key} in ${example_sets}`);
          errors.push(`keys not found, ${key} in ${example_sets}`);
        }
      }
    }
  
    return errors;
  }
  
  module.exports = { compareMessageId };
  