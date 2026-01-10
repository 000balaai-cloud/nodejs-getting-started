import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */

const PORT = process.env.PORT || 10000;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_URL = process.env.GOOGLE_SHEET_URL;

const WA_URL = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;

/* ================= MEMORY ================= */

const sessions = {};

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
  sessions[to] = { step: "MENU", completed: false };

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

  const map = {
    BUFFALO: [
      { id: "500ml|50", title: "500 ml", description: "₹50" },
      { id: "1L|100", title: "1 Liter", description: "₹100" },
    ],
    COW: [
      { id: "500ml|60", title: "500 ml", description: "₹60" },
      { id: "1L|120", title: "1 Liter", description: "₹120" },
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
        sections: [{ title: "Options", rows: map[product] }],
      },
    },
  });
}

async function addressMenu(to) {
  sessions[to].step = "ADDRESS";

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

async function orderSummary(to) {
  const s = sessions[to];
  s.step = "CONFIRM";

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
          {
            type: "reply",
            reply: { id: "CONFIRM", title: "✅ Confirm Order" },
          },
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

    /* 🔒 BLOCK DUPLICATE WEBHOOKS */
    if (sessions[from]?.completed) {
      return res.sendStatus(200);
    }

    /* ✅ CONFIRM HANDLER (FIRST & FINAL) */
    if (replyId === "CONFIRM" && sessions[from]) {
      const s = sessions[from];
      s.completed = true;

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

      delete sessions[from]; // 🔥 HARD STOP
      return res.sendStatus(200);
    }

    /* NEW USER */
    if (!sessions[from]) {
      await mainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    if (s.step === "MENU") return quantityMenu(from, replyId);

    if (s.step === "QTY") {
      const [qty, price] = replyId.split("|");
      s.quantity = qty;
      s.price = price;
      return addressMenu(from);
    }

    if (s.step === "ADDRESS") {
      s.address = replyId === "LIVE" ? "Live Location" : "Typed Address";
      return timeMenu(from);
    }

    if (s.step === "TIME") {
      s.time = replyId;
      return orderSummary(from);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= VERIFY ================= */

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.listen(PORT, () =>
  console.log("✅ Server running on port", PORT)
);
