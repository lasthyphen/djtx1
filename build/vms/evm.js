"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const avalanche_1 = require("avalanche");
const web3_1 = __importDefault(require("web3"));
const utils_1 = require("./utils");
const Log_1 = __importDefault(require("./Log"));
const ERC20Interface_json_1 = __importDefault(require("./ERC20Interface.json"));
class EVM {
    constructor(config, PK) {
        this.web3 = new web3_1.default(config.RPC);
        this.account = this.web3.eth.accounts.privateKeyToAccount(PK);
        this.contracts = new Map();
        this.NAME = config.NAME;
        this.DECIMALS = config.DECIMALS || 18;
        this.DRIP_AMOUNT = (0, utils_1.calculateBaseUnit)(config.DRIP_AMOUNT.toString(), this.DECIMALS);
        this.MAX_PRIORITY_FEE = config.MAX_PRIORITY_FEE;
        this.MAX_FEE = config.MAX_FEE;
        this.RECALIBRATE = config.RECALIBRATE || 30;
        this.LEGACY = false;
        this.log = new Log_1.default(this.NAME);
        this.hasNonce = new Map();
        this.hasError = new Map();
        this.pendingTxNonces = new Set();
        this.nonce = -1;
        this.balance = new avalanche_1.BN(0);
        this.isFetched = false;
        this.isUpdating = false;
        this.recalibrate = false;
        this.waitingForRecalibration = false;
        this.waitArr = [];
        this.queue = [];
        this.error = false;
        this.setupTransactionType();
        this.recalibrateNonceAndBalance();
        setInterval(() => {
            this.recalibrateNonceAndBalance();
        }, this.RECALIBRATE * 1000);
    }
    // Setup Legacy or EIP1559 transaction type
    setupTransactionType() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const baseFee = (yield this.web3.eth.getBlock('latest')).baseFeePerGas;
                if (baseFee == undefined) {
                    this.LEGACY = true;
                }
                this.error = false;
            }
            catch (err) {
                this.error = true;
                this.log.error(err.message);
            }
        });
    }
    // Function to issue transfer transaction. For ERC20 transfers, 'id' will be a string representing ERC20 token ID
    sendToken(receiver, id, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.error) {
                cb({ status: 400, message: "Internal RPC error! Please try after sometime" });
                return;
            }
            if (!this.web3.utils.isAddress(receiver)) {
                cb({ status: 400, message: "Invalid address! Please try again." });
                return;
            }
            let amount = this.DRIP_AMOUNT;
            // If id is provided, then it is ERC20 token transfer, so update the amount
            if (this.contracts.get(id)) {
                const dripAmount = this.contracts.get(id).config.DRIP_AMOUNT;
                if (dripAmount) {
                    amount = (0, utils_1.calculateBaseUnit)(dripAmount.toString(), this.contracts.get(id).config.DECIMALS || 18);
                }
            }
            this.processRequest({ receiver, amount, id });
            // After transaction is being processed, the nonce will be available and txHash can be returned to user
            const waitingForNonce = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                if (this.hasNonce.get(receiver + id) != undefined) {
                    clearInterval(waitingForNonce);
                    const nonce = this.hasNonce.get(receiver + id);
                    this.hasNonce.set(receiver + id, undefined);
                    const { txHash } = yield this.getTransaction(receiver, amount, nonce, id);
                    if (txHash) {
                        cb({
                            status: 200,
                            message: `Transaction successful on ${this.NAME} Network!`,
                            txHash
                        });
                    }
                    else {
                        cb({
                            status: 400,
                            message: `Transaction failed on ${this.NAME}! Please try again.`
                        });
                    }
                }
                else if (this.hasError.get(receiver) != undefined) {
                    clearInterval(waitingForNonce);
                    const errorMessage = this.hasError.get(receiver);
                    this.hasError.set(receiver, undefined);
                    cb({
                        status: 400,
                        message: errorMessage
                    });
                }
            }), 300);
        });
    }
    processRequest(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isFetched || this.recalibrate || this.waitingForRecalibration) {
                this.waitArr.push(req);
                if (!this.isUpdating && !this.waitingForRecalibration) {
                    yield this.updateNonceAndBalance();
                }
            }
            else {
                this.putInQueue(req);
            }
        });
    }
    getBalance(id) {
        if (id && this.contracts.get(id)) {
            return this.getERC20Balance(id);
        }
        else {
            return this.balance;
        }
    }
    getERC20Balance(id) {
        var _a;
        return (_a = this.contracts.get(id)) === null || _a === void 0 ? void 0 : _a.balance;
    }
    fetchERC20Balance() {
        return __awaiter(this, void 0, void 0, function* () {
            this.contracts.forEach((contract) => __awaiter(this, void 0, void 0, function* () {
                contract.balance = new avalanche_1.BN(yield contract.methods.balanceOf(this.account.address).call());
            }));
        });
    }
    updateNonceAndBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isUpdating = true;
            try {
                [this.nonce, this.balance] = yield Promise.all([
                    this.web3.eth.getTransactionCount(this.account.address, 'latest'),
                    this.web3.eth.getBalance(this.account.address),
                ]);
                yield this.fetchERC20Balance();
                this.balance = new avalanche_1.BN(this.balance);
                this.error && this.log.info("RPC server recovered!");
                this.error = false;
                this.isFetched = true;
                this.isUpdating = false;
                this.recalibrate = false;
                while (this.waitArr.length != 0) {
                    this.putInQueue(this.waitArr.shift());
                }
            }
            catch (err) {
                this.isUpdating = false;
                this.error = true;
                this.log.error(err.message);
            }
        });
    }
    balanceCheck(req) {
        const balance = this.getBalance(req.id);
        if (req.id && this.contracts.get(req.id)) {
            if (this.contracts.get(req.id).balance.gt(req.amount)) {
                this.contracts.get(req.id).balance = this.contracts.get(req.id).balance.sub(req.amount);
                return true;
            }
        }
        else {
            if (this.balance.gt(req.amount)) {
                this.balance = this.balance.sub(req.amount);
                return true;
            }
        }
        return false;
    }
    putInQueue(req) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.balanceCheck(req)) {
                this.queue.push(Object.assign(Object.assign({}, req), { nonce: this.nonce }));
                this.hasNonce.set(req.receiver + req.id, this.nonce);
                this.nonce++;
                this.executeQueue();
            }
            else {
                this.log.warn("Faucet balance too low!" + this.balance);
                this.hasError.set(req.receiver, "Faucet balance too low! Please try after sometime.");
            }
        });
    }
    executeQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const { amount, receiver, nonce, id } = this.queue.shift();
            this.sendTokenUtil(amount, receiver, nonce, id);
        });
    }
    sendTokenUtil(amount, receiver, nonce, id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.pendingTxNonces.add(nonce);
            const { rawTransaction } = yield this.getTransaction(receiver, amount, nonce, id);
            try {
                const timeout = setTimeout(() => {
                    this.log.error(`Timeout reached for transaction with nonce ${nonce}`);
                    this.pendingTxNonces.delete(nonce);
                }, 10 * 1000);
                yield this.web3.eth.sendSignedTransaction(rawTransaction);
                this.pendingTxNonces.delete(nonce);
                clearTimeout(timeout);
            }
            catch (err) {
                this.pendingTxNonces.delete(nonce);
                this.log.error(err.message);
            }
        });
    }
    getTransaction(to, value, nonce, id) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const tx = {
                type: 2,
                gas: "21000",
                nonce,
                to,
                maxPriorityFeePerGas: this.MAX_PRIORITY_FEE,
                maxFeePerGas: this.MAX_FEE,
                value
            };
            if (this.LEGACY) {
                delete tx["maxPriorityFeePerGas"];
                delete tx["maxFeePerGas"];
                tx.gasPrice = yield this.getAdjustedGasPrice();
                tx.type = 0;
            }
            if (this.contracts.get(id)) {
                const txObject = (_a = this.contracts.get(id)) === null || _a === void 0 ? void 0 : _a.methods.transfer(to, value);
                tx.data = txObject.encodeABI();
                tx.value = 0;
                tx.to = (_b = this.contracts.get(id)) === null || _b === void 0 ? void 0 : _b.config.CONTRACTADDRESS;
                tx.gas = (_c = this.contracts.get(id)) === null || _c === void 0 ? void 0 : _c.config.GASLIMIT;
            }
            let signedTx;
            try {
                signedTx = yield this.account.signTransaction(tx);
            }
            catch (err) {
                this.error = true;
                this.log.error(err.message);
            }
            const txHash = signedTx === null || signedTx === void 0 ? void 0 : signedTx.transactionHash;
            const rawTransaction = signedTx === null || signedTx === void 0 ? void 0 : signedTx.rawTransaction;
            return { txHash, rawTransaction };
        });
    }
    getGasPrice() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.web3.eth.getGasPrice();
        });
    }
    getAdjustedGasPrice() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const gasPrice = yield this.getGasPrice();
                const adjustedGas = Math.floor(gasPrice * 1.25);
                return Math.min(adjustedGas, parseInt(this.MAX_FEE));
            }
            catch (err) {
                this.error = true;
                this.log.error(err.message);
                return 0;
            }
        });
    }
    recalibrateNonceAndBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            this.waitingForRecalibration = true;
            if (this.pendingTxNonces.size === 0 && this.isUpdating === false) {
                this.isFetched = false;
                this.recalibrate = true;
                this.waitingForRecalibration = false;
                this.pendingTxNonces.clear();
                this.updateNonceAndBalance();
            }
            else {
                const recalibrateNow = setInterval(() => {
                    if (this.pendingTxNonces.size === 0 && this.isUpdating === false) {
                        clearInterval(recalibrateNow);
                        this.waitingForRecalibration = false;
                        this.recalibrateNonceAndBalance();
                    }
                }, 300);
            }
        });
    }
    addERC20Contract(config) {
        return __awaiter(this, void 0, void 0, function* () {
            this.contracts.set(config.ID, {
                methods: (new this.web3.eth.Contract(ERC20Interface_json_1.default, config.CONTRACTADDRESS)).methods,
                balance: 0,
                config
            });
        });
    }
}
exports.default = EVM;
