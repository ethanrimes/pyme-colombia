import { randomBytes, createHash } from "node:crypto";
const token = "nx_" + randomBytes(32).toString("hex");
console.log("Admin access key (save in your password manager):\n" + token);
console.log(
  "\nADMIN_API_TOKEN_HASH (configure as a Worker secret):\n" +
    createHash("sha256").update(token).digest("hex"),
);
console.log(
  "\nINTEGRATION_ENCRYPTION_KEY (configure as a Worker secret):\n" +
    randomBytes(32).toString("base64"),
);
