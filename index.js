import express from "express";
import axios from "axios";
const fs = require('fs'); // For persistent sessions

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const WA_URL = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_URL = process.env.GOOGLE_SHEET_URL;
const SESSION_FILE = '/data/sessions.json'; // Mount path for Render disk (add Disk in Render dashboard)
const sessions = {};

/* ================= PERSISTENCE ================= */
// Load sessions from file at startup
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      Object.assign(sessions, JSON.parse(data));
      console.log('Sessions loaded from file');
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
}

// Save sessions to file after changes
function saveSessions() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions));
  } catch (err) {
    console.error('Error saving sessions:', err);
  }
}

// Load at server start
loadSessions();

/* ================= HELPERS ================= */
async function send(payload) {
  await axios.post(WA_URL, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}
const sendText = (to, body) =>
  send({ messaging_product: "whatsapp", to, text: { body } });

/* ================= MENUS ================= */
async function mainMenu(to) {
  sessions[to] = { step: "MENU" };
  saveSessions();
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "🥛 Bala Milk Store" },
      body: { text: "Please choose an option" },
      action: {
        button: "Menu",
        sections: [
          {
            title: "Products",
            rows: [
              { id: "BUFFALO", title: "Buffalo Milk", description: "₹100 / L" },
              { id: "COW", title: "Cow Milk", description: "₹120 / L" },
              { id: "PANEER", title: "Paneer", description: "₹600 / Kg" },
              { id: "GHEE", title: "Ghee", description: "₹1000 / Kg" },
            ],
          },
        ],
      },
    },
  });
}
async function quantityMenu(to, product) {
  const s = sessions[to];
  s.step = "QTY";
  s.product = product;
  saveSessions();
  const map = {
    BUFFALO: [
      { id: "500ml|50", title: "500 ml", description: "₹50" },
      { id: "1L|100", title: "1 Liter", description: "₹100" },
    ],
    COW: [
      { id: "500ml|60", title: "500 ml", description: "₹60" },
      { id: "1L|120", title: "1 Liter", description: "₹120" },
    ],
    PANEER: [
      { id: "250g|150", title: "250 g", description: "₹150" },
      { id: "500g|300", title: "500 g", description: "₹300" },
    ],
    GHEE: [
      { id: "250g|250", title: "250 g", description: "₹250" },
      { id: "500g|500", title: "500 g", description: "₹500" },
    ],
  };
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Select quantity" },
      action: {
        button: "Quantity",
        sections: [
          { title: "Options", rows: map[product] },
          { title: "Navigation", rows: [{ id: "BACK_MENU", title: "⬅ Back" }] },
        ],
      },
    },
  });
}
async function addressMenu(to) {
  sessions[to].step = "ADDRESS";
  saveSessions();
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Choose address option" },
      action: {
        button: "Address",
        sections: [
          {
            title: "Address",
            rows: [
              { id: "LIVE", title: "📍 Share Live Location" },
              { id: "TYPE", title: "✍ Type Address" },
            ],
          },
        ],
      },
    },
  });
}
async function timeMenu(to) {
  sessions[to].step = "TIME";
  saveSessions();
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Choose delivery time" },
      action: {
        button: "Time",
        sections: [
          {
            title: "Slots",
            rows: [
              { id: "Morning", title: "🌅 Morning (6–9 AM)" },
              { id: "Evening", title: "🌆 Evening (5–8 PM)" },
            ],
          },
        ],
      },
    },
  });
}
async function summary(to) {
  const s = sessions[to];
  s.step = "CONFIRMING";
  saveSessions();
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          `🧾 *Order Summary*\n\n` +
          `Product: ${s.product}\n` +
          `Quantity: ${s.quantity}\n` +
          `Price: ₹${s.price}\n` +
          `Address: ${s.address}\n` +
          `Time: ${s.time}`,
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONFIRM", title: "✅ Confirm Order" } },
        ],
      },
    },
  });
}
/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);
    const from = msg.from;
    const replyId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;
    /* 🚫 Ignore all events if order already completed */
    if (sessions[from]?.step === "COMPLETED") {
      return res.sendStatus(200);
    }
    /* Start menu only on first text */
    if (!sessions[from] && msg.type === "text") {
      await mainMenu(from);
      return res.sendStatus(200);
    }
    const s = sessions[from];
    if (!s) return res.sendStatus(200);
    if (replyId === "BACK_MENU") {
      await mainMenu(from);
      return res.sendStatus(200);
    }
    if (s.step === "MENU") return quantityMenu(from, replyId);
    if (s.step === "QTY") {
      const [q, p] = replyId.split("|");
      s.quantity = q;
      s.price = p;
      saveSessions();
      return addressMenu(from);
    }
    if (s.step === "ADDRESS") {
      s.address = replyId === "LIVE" ? "Live Location" : "Typed Address";
      saveSessions();
      return timeMenu(from);
    }
    if (s.step === "TIME") {
      s.time = replyId;
      saveSessions();
      return summary(from);
    }
    if (replyId === "CONFIRM" && s.step === "CONFIRMING") {
      s.step = "COMPLETED"; // 🔥 CRITICAL FIX
      saveSessions();
      const orderId = "ORD" + Date.now();
      await axios.post(SHEET_URL, {
        orderId,
        phone: from,
        product: s.product,
        quantity: s.quantity,
        price: s.price,
        address: s.address,
        deliveryTime: s.time,
      });
      await sendText(
        from,
        `🙏 *Thank you for ordering from Bala Milk Store*\n\n🆔 Order ID: ${orderId}\nWe will contact you shortly.`
      );
      return res.sendStatus(200);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});
/* ================= VERIFY ================= */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});
app.listen(10000, () =>
  console.log("Server running on port 10000")
);
