"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBaseUnit = void 0;
const avalanche_1 = require("avalanche");
function calculateBaseUnit(amount, decimals) {
    for (let i = 0; i < decimals; i++) {
        amount += "0";
    }
    return new avalanche_1.BN(amount);
}
exports.calculateBaseUnit = calculateBaseUnit;
