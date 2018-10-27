import { networkSymbols } from '../partnersConfig';
import { ChangellyCurrencies } from './config';
import changellyCalls from './changelly-calls';

import changellyApi from './changelly-api';

import debug from 'debug';

const errorLogger = debug('v5:partners-changelly');

export default class Changelly {
  constructor(props = {}) {
    this.name = Changelly.getName();
    this.network = props.network || networkSymbols.ETH;
    this.hasRates = 0;
    this.currencyDetails = props.currencies || ChangellyCurrencies;
    this.currencyIconList = [];
    this.erc20List = [];
    this.tokenDetails = {};
    this.getSupportedCurrencies(this.network);
  }

  static getName() {
    return 'changelly';
  }

  static parseOrder(order) {
    return {
      orderId: order.id,
      statusId: undefined,
      sendToAddress: order.payinAddress,
      recValue: order.amountExpectedTo,
      sendValue: order.amountExpectedFrom,
      status: order.status,
      timestamp: order.createdAt,
      validFor: 600 // Think it may be valid for longer, but I need to ask
    };
  }

  static async getOrderStatus(swapDetails) {
    const parsed = Changelly.parseOrder(swapDetails.dataForInitialization);
    return await changellyCalls.getStatus(parsed.orderId);
  }

  statusUpdater(/*swapDetails*/) {
    return () => {
      // let currentStatus;
      // const calculateTimeRemaining = (validFor, timestamp) => {
      //   return (
      //     validFor -
      //     parseInt(
      //       (new Date().getTime() - new Date(timestamp).getTime()) / 1000
      //     )
      //   );
      // };
      // const parsed = Changelly.parseOrder(swapDetails.dataForInitialization);
      // // let timeRemaining = calculateTimeRemaining(
      // //   parsed.validFor,
      // //   parsed.timestamp
      // // );
      // let checkStatus = setInterval(async () => {
      //   currentStatus = await getStatus({
      //     orderid: parsed.orderId
      //   });
      //   clearInterval(checkStatus);
      // }, 1000);
    };
  }

  static statuses(data) {
    const statuses = {
      new: 1,
      waiting: 2,
      confirming: 3,
      confirmed: 10,
      finished: 0,
      failed: -1
    };
    let status = statuses[data.status];
    if (typeof status === 'undefined') {
      return 2;
    }
    return status;
  }

  get validNetwork() {
    return this.network === networkSymbols.ETH;
  }

  get currencies() {
    if (this.validNetwork) {
      return this.currencyDetails;
    }
    return {};
  }

  getInitialCurrencyEntries(collectMapFrom, collectMapTo) {
    for (const prop in this.currencies) {
      if (this.currencies[prop])
        collectMapTo.set(prop, {
          symbol: prop,
          name: this.currencies[prop].name
        });
      collectMapFrom.set(prop, {
        symbol: prop,
        name: this.currencies[prop].name
      });
    }
  }

  getUpdatedFromCurrencyEntries(value, collectMap) {
    if (this.currencies[value.symbol]) {
      for (const prop in this.currencies) {
        if (prop !== value.symbol) {
          if (this.currencies[prop])
            collectMap.set(prop, {
              symbol: prop,
              name: this.currencies[prop].name
            });
        }
      }
    }
  }

  getUpdatedToCurrencyEntries(value, collectMap) {
    if (this.currencies[value.symbol]) {
      for (const prop in this.currencies) {
        if (prop !== value.symbol) {
          if (this.currencies[prop])
            collectMap.set(prop, {
              symbol: prop,
              name: this.currencies[prop].name
            });
        }
      }
    }
  }

  async startSwap(swapDetails) {
    if (swapDetails.minValue < swapDetails.fromValue) {
      swapDetails.dataForInitialization = await this.createSwap(swapDetails);
      swapDetails.parsed = Changelly.parseOrder(
        swapDetails.dataForInitialization
      );
      swapDetails.providerAddress =
        swapDetails.dataForInitialization.payinAddress;
      return swapDetails;
    }
    throw Error('From amount below changelly minimun for currency pair');
  }

  getSupportedTokens() {
    if (this.hasTokens) {
      return this.tokenDetails;
    }
    return {};
  }

  validSwap(fromCurrency, toCurrency) {
    if (this.validNetwork) {
      return this.currencies[fromCurrency] && this.currencies[toCurrency];
    }
    return false;
  }

  async createSwap(swapDetails) {
    return await this.createTransaction(
      swapDetails.fromCurrency,
      swapDetails.toCurrency,
      swapDetails.toAddress,
      swapDetails.fromAddress,
      swapDetails.fromValue
    );
  }

  getCurrencyIcon(currency) {
    if (this.currencyIconList[currency]) {
      return this.currencyIconList[currency];
    }
  }

  getCurrencyIconList() {
    return this.currencyIconList;
  }

  async getSupportedCurrencies() {
    try {
      const {
        currencyDetails,
        tokenDetails
      } = await changellyApi.getSupportedCurrencies(this.network);
      this.currencyDetails = currencyDetails;
      this.tokenDetails = tokenDetails;
      this.hasRates =
        Object.keys(this.tokenDetails).length > 0 ? this.hasRates + 1 : 0;
    } catch (e) {
      errorLogger(e);
    }
  }

  async _getRate(fromCurrency, toCurrency, fromValue) {
    return await changellyCalls.getRate(
      {
        from: fromCurrency,
        to: toCurrency,
        amount: fromValue
      },
      this.network
    );
  }

  async getMin(fromCurrency, toCurrency, fromValue) {
    return await changellyCalls.getMin(
      {
        from: fromCurrency,
        to: toCurrency,
        amount: fromValue
      },
      this.network
    );
  }

  async getRate(fromCurrency, toCurrency, fromValue) {
    const changellyDetails = await Promise.all([
      this.getMin(fromCurrency, toCurrency, fromValue),
      this._getRate(fromCurrency, toCurrency, fromValue)
    ]);
    return {
      fromCurrency,
      toCurrency,
      provider: this.name,
      minValue: changellyDetails[0],
      rate: changellyDetails[1]
    };
  }

  async validateAddress(toCurrency, address) {
    return await changellyCalls.validateAddress(
      {
        currency: toCurrency,
        address: address
      },
      this.network
    );
  }

  async createTransaction(
    fromCurrency,
    toCurrency,
    toAddress,
    fromAddress,
    fromValue
  ) {
    const swapParams = {
      from: fromCurrency.toLowerCase(),
      to: toCurrency.toLowerCase(),
      address: toAddress,
      extraId: null,
      amount: fromValue,
      refundAddress: fromAddress !== '' ? fromAddress : toAddress,
      refundExtraId: null
    };
    return await changellyCalls.createTransaction(swapParams, this.network);
  }
}
