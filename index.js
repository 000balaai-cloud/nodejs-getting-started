import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const sessions = {};

const WHATSAPP_API = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const TOKEN = process.env.WHATSAPP_TOKEN;

/* ------------------ HELPERS ------------------ */

async function sendMessage(payload) {
  await axios.post(WHATSAPP_API, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

async function sendText(to, text) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    text: { body: text },
  });
}

/* ------------------ MENUS ------------------ */

async function sendMainMenu(to) {
  sessions[to] = { step: "MENU" };

  await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "🥛 Bala Milk Store" },
      body: { text: "Please choose an option" },
      footer: { text: "Tap to select" },
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
          {
            title: "Others",
            rows: [
              { id: "SUBS", title: "Daily Subscription" },
              { id: "OWNER", title: "Talk to Owner" },
            ],
          },
        ],
      },
    },
  });
}

async function sendQuantityMenu(to, product) {
  sessions[to].step = "QTY";

  const qtyMap = {
    BUFFALO: [
      { id: "0.5", title: "500 ml", description: "₹50" },
      { id: "1", title: "1 Liter", description: "₹100" },
      { id: "2", title: "2 Liters", description: "₹200" },
    ],
    COW: [
      { id: "0.5", title: "500 ml", description: "₹60" },
      { id: "1", title: "1 Liter", description: "₹120" },
    ],
    PANEER: [
      { id: "250", title: "250 g", description: "₹150" },
      { id: "500", title: "500 g", description: "₹300" },
    ],
    GHEE: [
      { id: "250", title: "250 g", description: "₹250" },
      { id: "500", title: "500 g", description: "₹500" },
    ],
  };

  await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: `Select quantity for ${product}` },
      action: {
        button: "Quantity",
        sections: [
          {
            title: "Available",
            rows: qtyMap[product],
          },
          {
            title: "Navigation",
            rows: [{ id: "BACK_MENU", title: "⬅ Back" }],
          },
        ],
      },
    },
  });
}

async function sendAddressMenu(to) {
  sessions[to].step = "ADDRESS";

  await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Select delivery address option" },
      action: {
        button: "Address",
        sections: [
          {
            title: "Address Options",
            rows: [
              { id: "LIVE_LOC", title: "📍 Share Live Location" },
              { id: "TYPE_ADDR", title: "✍ Type Address" },
            ],
          },
          {
            title: "Navigation",
            rows: [{ id: "BACK_QTY", title: "⬅ Back" }],
          },
        ],
      },
    },
  });
}

async function sendTimeMenu(to) {
  sessions[to].step = "TIME";

  await sendMessage({
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
              { id: "MORNING", title: "🌅 Morning (6–9 AM)" },
              { id: "EVENING", title: "🌆 Evening (5–8 PM)" },
            ],
          },
          {
            title: "Navigation",
            rows: [{ id: "BACK_ADDR", title: "⬅ Back" }],
          },
        ],
      },
    },
  });
}

async function sendSummary(to) {
  const s = sessions[to];

  await sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          `🧾 *Order Summary*\n\n` +
          `Product: ${s.product}\n` +
          `Quantity: ${s.qty}\n` +
          `Address: ${s.address}\n` +
          `Time: ${s.time}`,
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONFIRM", title: "✅ Confirm" } },
          { type: "reply", reply: { id: "BACK_TIME", title: "⬅ Back" } },
        ],
      },
    },
  });
}

/* ------------------ WEBHOOK ------------------ */

app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const id = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id;

    if (!sessions[from]) {
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    if (s.step === "MENU") {
      s.product = id;
      await sendQuantityMenu(from, id);
    }

    else if (id === "BACK_MENU") {
      await sendMainMenu(from);
    }

    else if (s.step === "QTY") {
      if (id === "BACK_MENU") return sendMainMenu(from);
      s.qty = id;
      await sendAddressMenu(from);
    }

    else if (s.step === "ADDRESS") {
      if (id === "BACK_QTY") return sendQuantityMenu(from, s.product);
      s.address = id === "LIVE_LOC" ? "Live Location" : "Typed Address";
      await sendTimeMenu(from);
    }

    else if (s.step === "TIME") {
      if (id === "BACK_ADDR") return sendAddressMenu(from);
      s.time = id;
      await sendSummary(from);
    }

    else if (id === "CONFIRM") {
      await sendText(from, "✅ Order confirmed! Thank you 🙏");
      delete sessions[from];
      await sendMainMenu(from);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.sendStatus(200);
  }
});

/* ------------------ VERIFY ------------------ */

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.listen(10000, () => console.log("Server running on 10000"));
