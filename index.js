const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Temporary in-memory order store
const userOrders = {};

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("WhatsApp Bot Running");
});

/* =========================
   WEBHOOK VERIFY
========================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* =========================
   WEBHOOK RECEIVE
========================= */
app.post("/webhook", async (req, res) => {
  console.log("📩 Incoming:", JSON.stringify(req.body, null, 2));

  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;

    /* ========= TEXT MESSAGE ========= */
    if (message.text) {
      const text = message.text.body.toLowerCase();

      if (text === "hi") {
        userOrders[from] = {};
        await sendMainMenu(from);
      }
    }

    /* ========= BUTTON REPLY ========= */
    if (message.button) {
      const btn = message.button.payload;

      // MAIN MENU
      if (btn === "ORDER") {
        await sendQuantityMenu(from);
      }

      // QUANTITY
      if (btn.startsWith("QTY_")) {
        const qty = parseInt(btn.split("_")[1]);
        const price = qty * 500; // price per kg

        userOrders[from] = { qty, price };

        await sendConfirmation(from, qty, price);
      }

      // BACK
      if (btn === "BACK_MENU") {
        await sendMainMenu(from);
      }

      // CONFIRM
      if (btn === "CONFIRM_ORDER") {
        await sendText(
          from,
          `✅ Order confirmed!\n\nQuantity: ${userOrders[from].qty} Kg\nTotal: ₹${userOrders[from].price}\n\nOur team will contact you shortly.`
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   SEND FUNCTIONS
========================= */

async function sendMainMenu(to) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Welcome 👋\nPlease choose an option:" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "ORDER", title: "🛒 Place Order" } }
        ]
      }
    }
  });
}

async function sendQuantityMenu(to) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Select quantity (₹500 per Kg):" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "QTY_1", title: "1 Kg" } },
          { type: "reply", reply: { id: "QTY_2", title: "2 Kg" } },
          { type: "reply", reply: { id: "BACK_MENU", title: "⬅️ Back" } }
        ]
      }
    }
  });
}

async function sendConfirmation(to, qty, price) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `You selected:\n\nQuantity: ${qty} Kg\nTotal Price: ₹${price}\n\nConfirm order?`
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONFIRM_ORDER", title: "✅ Confirm" } },
          { type: "reply", reply: { id: "BACK_MENU", title: "⬅️ Back" } }
        ]
      }
    }
  });
}

async function sendText(to, text) {
  await axios.post(process.env.WHATSAPP_API_URL, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  });
}

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
