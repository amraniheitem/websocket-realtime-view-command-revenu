const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const bodyParser = require("body-parser");
const FakeOrder = require("./model-oder"); // ⚠️ chemin relatif

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

let connectedClients = new Set();

// Connect to MongoDB
const MONGO = process.env.MONGODB_URL;
mongoose
  .connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connecté"))
  .catch((err) => console.error("❌ MongoDB erreur:", err));

// --- Socket events ---
io.on("connection", async (socket) => {
  console.log("Client connecté:", socket.id);
  connectedClients.add(socket.id);

  // 1) Envoi état initial (quelques dernières commandes + revenus)
  try {
    const FakeOrders = await FakeOrder.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const totalRevenue = await FakeOrder.aggregate([
      { $match: { status: { $nin: ["CANCELLED", "PENDING"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    

    socket.emit("initData", {
      FakeOrders: FakeOrders.reverse(), // du plus ancien au plus récent
      revenue: totalRevenue[0] ? totalRevenue[0].total : 0,
    });
  } catch (err) {
    console.error("Erreur initData:", err);
  }

  // Optionnel: écouter des messages client (ex: action depuis frontend)
  socket.on("ping", (msg) => {
    socket.emit("pong", `PONG: ${msg}`);
  });

  socket.on("disconnect", () => {
    console.log("Client déconnecté:", socket.id);
    connectedClients.delete(socket.id);
  });
});

// --- API pour créer une commande (ex: formulaire admin/booking) ---
// Quand on crée via cette route, on sauvegarde en BDD ET on émet l'événement
app.post("/api/FakeOrders", async (req, res) => {
  try {
    const { produitId, price, nom, prenom, phone, status } = req.body;
    const order = new FakeOrder({ produitId, price, nom, prenom, phone, status });
    await order.save();

    io.emit("FakeOrderAdded", order);

    const totalRevenue = await FakeOrder.aggregate([
      { $match: { status: { $nin: ["CANCELLED", "PENDING"] } } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]);

    io.emit("stats", { revenue: totalRevenue[0] ? totalRevenue[0].total : 0 });

    return res.status(201).json(order);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur création commande" });
  }
});


if (process.env.ENABLE_CHANGE_STREAM === "true") {
  const db = mongoose.connection;
  db.once("open", () => {
    try {
      const FakeOrderCollection = db.collection("FakeOrders");
      const changeStream = FakeOrderCollection.watch([], {
        fullDocument: "updateLookup",
      });
      changeStream.on("change", (change) => {
        // Par exemple pour insertions
        if (change.operationType === "insert") {
          const FakeOrder = change.fullDocument;
          io.emit("FakeOrderAdded", FakeOrder);
        }
        // handle update/delete if needed
      });
      console.log("Change stream MongoDB activé ✔️");
    } catch (err) {
      console.error("Erreur change stream:", err);
    }
  });
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
