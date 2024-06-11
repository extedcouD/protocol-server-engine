const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    configName: {
      type: String,
      required: true,
    },
    transaction_id: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { strict: false }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = Transaction;
