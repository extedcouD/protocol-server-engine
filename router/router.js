const router = require("express").Router();
const {
  becknToBusiness,
  businessToBecknWrapper,
  updateSession,getsession
} = require("../controller/index");

// buss > beckn
router.post("/createPayload", businessToBecknWrapper);

// bkn > buss
router.post("/ondc/:method", becknToBusiness);

router.post("/updateSession", updateSession);

router.get("/health", (req, res) => {
  res.send({ status: "working" });
});

router.get("/session", getsession);
module.exports = router;
