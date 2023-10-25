import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import {
  DepositedToBins,
  Swap as SwapEvent,
  TransferBatch,
  WithdrawnFromBins
} from "../generated/LBPair/LBPair";
import {
  LBPair
} from "../generated/schema";
import {
  ADDRESS_ZERO,
  BIG_DECIMAL_ZERO,
  BIG_INT_ONE,
  BIG_INT_ZERO
} from "./constants";
import {
  loadLBFactory,
  loadLbPair,
  loadToken,
  trackBin,
} from "./entities";
import {
  decodeAmounts,
  formatTokenAmountByDecimals,
  isSwapForY
} from "./utils";

export function handleSwap(event: SwapEvent): void {
  const lbPair = loadLbPair(event.address);

  if (!lbPair) {
    log.warning("[handleSwap] LBPair not detected: {} ", [
      event.address.toHexString(),
    ]);
    return;
  }

  // reset tvl aggregates until new amounts calculated
  const lbFactory = loadLBFactory();

  const tokenX = loadToken(Address.fromString(lbPair.tokenX));
  const tokenY = loadToken(Address.fromString(lbPair.tokenY));

  const amountsInBytes32 = event.params.amountsIn;
  const amountsOutBytes32 = event.params.amountsOut;

  const swapForY = isSwapForY(amountsInBytes32);
  const tokenIn = swapForY ? tokenX : tokenY;
  const tokenOut = swapForY ? tokenY : tokenX;

  const amountsIn = decodeAmounts(amountsInBytes32);
  const amountsOut = decodeAmounts(amountsOutBytes32);
  
  const amountXInBI = amountsIn[0];
  const amountXOutBI = amountsOut[0];
  
  const amountYInBI = amountsIn[1];
  const amountYOutBI = amountsOut[1];

  const amountXIn = formatTokenAmountByDecimals(
    amountXInBI,
    tokenX.decimals
  );
  const amountXOut = formatTokenAmountByDecimals(
    amountXOutBI,
    tokenX.decimals
  );

  const amountYIn = formatTokenAmountByDecimals(
    amountYInBI,
    tokenY.decimals
  );

  const amountYOut = formatTokenAmountByDecimals(
    amountYOutBI,
    tokenY.decimals
  );

  // Bin
  const bin = trackBin(
    lbPair as LBPair,
    BigInt.fromI32(event.params.id),
    amountXIn,
    amountXOut,
    amountYIn,
    amountYOut,
    BIG_INT_ZERO,
    BIG_INT_ZERO
  );

  // LBPair
  lbPair.activeId = BigInt.fromI32(event.params.id);
  lbPair.txCount = lbPair.txCount.plus(BIG_INT_ONE);
  lbPair.reserveX = lbPair.reserveX.plus(amountXIn).minus(amountXOut);
  lbPair.reserveY = lbPair.reserveY.plus(amountYIn).minus(amountYOut);
  lbPair.save();

  // LBFactory
  lbFactory.txCount = lbFactory.txCount.plus(BIG_INT_ONE);
  lbFactory.save();

  // TokenX
  tokenX.txCount = tokenX.txCount.plus(BIG_INT_ONE);
  tokenX.save();

  // TokenY
  tokenY.txCount = tokenY.txCount.plus(BIG_INT_ONE);
  tokenY.save();
}

export function handleLiquidityAdded(event: DepositedToBins): void {
  const lbPair = loadLbPair(event.address);
  const lbFactory = loadLBFactory();

  if (!lbPair) {
    log.error(
      "[handleLiquidityAdded] returning because LBPair not detected: {} ",
      [event.address.toHexString()]
    );
    return;
  }

  const tokenX = loadToken(Address.fromString(lbPair.tokenX));
  const tokenY = loadToken(Address.fromString(lbPair.tokenY));

  let totalAmountX = BigDecimal.fromString('0');
  let totalAmountY = BigDecimal.fromString("0");

  for (let i = 0; i < event.params.amounts.length; i++) {
    const binId = event.params.ids[i];

    const amounts = decodeAmounts(event.params.amounts[i]);
    const amountX = formatTokenAmountByDecimals(amounts[0], tokenX.decimals);
    const amountY = formatTokenAmountByDecimals(amounts[1], tokenY.decimals);

    totalAmountX = totalAmountX.plus(amountX);
    totalAmountX = totalAmountY.plus(amountY);

    trackBin(
      lbPair,
      binId,
      amountX, // amountXIn
      BIG_DECIMAL_ZERO,
      amountY, // amountYIn
      BIG_DECIMAL_ZERO,
      BIG_INT_ZERO,
      BIG_INT_ZERO
    );
  }


  // LBPair
  lbPair.txCount = lbPair.txCount.plus(BIG_INT_ONE);
  lbPair.reserveX = lbPair.reserveX.plus(totalAmountX);
  lbPair.reserveY = lbPair.reserveY.plus(totalAmountY);

  lbPair.save();

  // LBFactory
  lbFactory.txCount = lbFactory.txCount.plus(BIG_INT_ONE);
  lbFactory.save();

  // TokenX
  tokenX.txCount = tokenX.txCount.plus(BIG_INT_ONE);
  tokenX.save();

  // TokenY
  tokenY.txCount = tokenY.txCount.plus(BIG_INT_ONE);
  tokenY.save();
}

export function handleLiquidityRemoved(event: WithdrawnFromBins): void {
  const lbPair = loadLbPair(event.address);
  const lbFactory = loadLBFactory();

  if (!lbPair) {
    return;
  }

  const tokenX = loadToken(Address.fromString(lbPair.tokenX));
  const tokenY = loadToken(Address.fromString(lbPair.tokenY));

  let totalAmountX = BigDecimal.fromString('0');
  let totalAmountY = BigDecimal.fromString("0");

  for (let i = 0; i < event.params.amounts.length; i++) {
    const binId = event.params.ids[i];

    const amounts = decodeAmounts(event.params.amounts[i]);
    const amountX = formatTokenAmountByDecimals(amounts[0], tokenX.decimals);
    const amountY = formatTokenAmountByDecimals(amounts[1], tokenY.decimals);

    totalAmountX = totalAmountX.plus(amountX);
    totalAmountX = totalAmountY.plus(amountY);

    trackBin(
      lbPair,
      binId,
      BIG_DECIMAL_ZERO,
      amountX, // amountXIn
      BIG_DECIMAL_ZERO,
      amountY, // amountYIn
      BIG_INT_ZERO,
      BIG_INT_ZERO
    );
  }

  // LBPair
  lbPair.txCount = lbPair.txCount.plus(BIG_INT_ONE);
  lbPair.reserveX = lbPair.reserveX.minus(totalAmountX);
  lbPair.reserveY = lbPair.reserveY.minus(totalAmountY);
  lbPair.save();

  // LBFactory
  lbFactory.txCount = lbFactory.txCount.plus(BIG_INT_ONE);
  lbFactory.save();

  // TokenX
  tokenX.txCount = tokenX.txCount.plus(BIG_INT_ONE);
  tokenX.save();

  // TokenY
  tokenY.txCount = tokenY.txCount.plus(BIG_INT_ONE);
  tokenY.save();
}

export function handleTransferBatch(event: TransferBatch): void {
  const lbPair = loadLbPair(event.address);
  if (!lbPair) {
    return;
  }

  lbPair.txCount = lbPair.txCount.plus(BIG_INT_ONE);
  lbPair.save();

  const lbFactory = loadLBFactory();
  lbFactory.txCount = lbFactory.txCount.plus(BIG_INT_ONE);
  lbFactory.save();

  for (let i = 0; i < event.params.amounts.length; i++) {
    const isMint = ADDRESS_ZERO.equals(event.params.from);
    const isBurn = ADDRESS_ZERO.equals(event.params.to);

    // mint: increase bin totalSupply
    if (isMint) {
      trackBin(
        lbPair,
        event.params.ids[i],
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        event.params.amounts[i], // minted
        BIG_INT_ZERO
      );
    }

    // burn: decrease bin totalSupply
    if (isBurn) {
      trackBin(
        lbPair,
        event.params.ids[i],
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        BIG_DECIMAL_ZERO,
        BIG_INT_ZERO,
        event.params.amounts[i] // burned
      );
    }
  }
}
