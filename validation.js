function validatePurchase(body, validCategoryIds) {
  // V1: Reject non-object/null/array bodies. Validate names and numeric types/bounds.
  // Use Number.isInteger (which rejects strings and Booleans).
  // Return {error:"..."} on failure; otherwise {value:{name,quantity,unitPriceCents,categoryId}}.
  // Do not modify body. Check membership in validCategoryIds, an array of integers.
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return {valid:false, error:'Request body must be an object'};

  const {name, quantity, unitPriceCents, categoryId} = body;

  if (typeof name !== 'string' || name.trim() === '')
    return {valid:false, error:'Name is required'};

  if (!Number.isInteger(quantity) || quantity <= 0)
    return {valid:false, error:'Quantity must be an integer value greater than 0'};

  if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0)
    return {valid:false, error:'Unit price must be an integer value greater than 0'};

  if (!validCategoryIds.includes(categoryId))
    return {valid:false, error:'Invalid category ID'};

  return {
    valid:true,
    data:{name:name.trim(), quantity, unitPriceCents, categoryId}
  };
}
module.exports={validatePurchase};
