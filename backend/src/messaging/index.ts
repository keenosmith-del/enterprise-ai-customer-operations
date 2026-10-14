import { config } from "../config.js";
import { RabbitBroker } from "./rabbitmq.js";
import { AzureBroker } from "./azure.js";
export const createBroker = () =>
  config.MESSAGING_PROVIDER === "azure"
    ? new AzureBroker()
    : new RabbitBroker();
