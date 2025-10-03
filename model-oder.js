const mongoose = require("mongoose")
const orderSchema = new mongoose.Schema({
  produitId: { type: mongoose.Schema.Types.ObjectId },
  phone: { type: String, required: true },
  nom: { type: String, required: true },
  prenom: { type: String, required: true }, // ⚠️ pas d’accent ici sinon bug
  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "CANCELLED"],
    default: "PENDING",
  },
  price: { type: Number, required: true }, // ⚠️ number et pas string
  createdAt: { type: Date, default: Date.now },
});

const FakeOrder = mongoose.model("FakeOrder", orderSchema);
module.exports = FakeOrder; // ✅ pas "export default"
