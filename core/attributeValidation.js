async function comapreObjects(examples, attributes, example_sets) {
  let errors = [];

  for (const key in examples) {
    //un-commnet this if key is not found
    //console.log('key', key, examples[key])
    if (key !== "tags")
      if (
        typeof examples[key] === "object" &&
        typeof attributes[key] === "object"
      ) {
        if (!attributes[key]) {
          console.log(`null value found for, ${key} in  ${example_sets}`);
          errors.push(`null value found for, ${key} in  ${example_sets}`);
        } else if (Array.isArray(examples[key])) {
          for (let i = 0; i < examples[key]?.length; i++) {
            const exampleItem = examples[key][i];
            const attributeItem = attributes[key];
            //use if array has no keys like: category_ids
            if (typeof exampleItem === "string" && attributeItem) {
              //found
            } else {
              const err = await comapreObjects(
                exampleItem,
                attributeItem,
                example_sets
              );
              errors = [...errors, ...err];
            }
          }
        } else {
          const err = await comapreObjects(
            examples[key],
            attributes[key],
            example_sets
          );
          errors = [...errors, ...err];
        }
      } else if (!attributes.hasOwnProperty(key)) {
        console.log(`keys not found, ${key} in  ${example_sets}`);
        errors.push(`keys not found, ${key} in  ${example_sets}`);
      }
  }
  // console.log("Attribute validation succesful");
  return errors;
}

module.exports = { comapreObjects };
