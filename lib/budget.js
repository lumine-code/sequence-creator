const INPUT_LIMIT = 4096;
const ITEM_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 8 * 1024 * 1024;
const SELECTION_LIMIT = 100000;

function checkLength(length, limit, label) {
  if (!Number.isSafeInteger(length) || length < 0 || length > limit)
    throw new RangeError(
      `${label} exceeds its ${limit.toLocaleString("en-US")} UTF-16 unit limit. Nothing was inserted.`,
    );
}

module.exports = { INPUT_LIMIT, ITEM_LIMIT, OUTPUT_LIMIT, SELECTION_LIMIT, checkLength };
