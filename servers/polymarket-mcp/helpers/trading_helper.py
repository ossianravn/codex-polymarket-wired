#!/usr/bin/env python3
import json
import os
import sys
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, Optional

from py_clob_client.client import ClobClient
from py_clob_client.clob_types import (
    ApiCreds,
    AssetType,
    BalanceAllowanceParams,
    MarketOrderArgs,
    OpenOrderParams,
    OrderArgs,
    OrderScoringParams,
    OrdersScoringParams,
    OrderType,
    PartialCreateOrderOptions,
)


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def to_jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    if hasattr(value, "__dict__") and not isinstance(value, type):
        return to_jsonable(vars(value))
    return value


def load_client() -> ClobClient:
    host = os.getenv("POLYMARKET_CLOB_URL", "https://clob.polymarket.com")
    chain_id = int(os.getenv("POLYMARKET_CHAIN_ID", "137"))
    private_key = os.getenv("POLYMARKET_PRIVATE_KEY") or None
    signature_type = int(os.getenv("POLYMARKET_SIGNATURE_TYPE", "0"))
    funder = os.getenv("POLYMARKET_FUNDER") or None

    creds: Optional[ApiCreds] = None
    api_key = os.getenv("POLYMARKET_API_KEY") or None
    api_secret = os.getenv("POLYMARKET_API_SECRET") or None
    api_passphrase = os.getenv("POLYMARKET_API_PASSPHRASE") or None
    if api_key and api_secret and api_passphrase:
        creds = ApiCreds(api_key=api_key, api_secret=api_secret, api_passphrase=api_passphrase)

    client = ClobClient(
        host,
        chain_id=chain_id,
        key=private_key,
        creds=creds,
        signature_type=signature_type,
        funder=funder,
    )

    if creds is None and private_key and env_bool("POLYMARKET_AUTO_DERIVE_API_CREDS", True):
        client.set_api_creds(client.create_or_derive_api_creds())

    return client


def action_open_orders(client: ClobClient, payload: Dict[str, Any]) -> Any:
    params = OpenOrderParams(
        id=payload.get("id"),
        market=payload.get("market"),
        asset_id=payload.get("asset_id"),
    )
    orders = client.get_orders(params)
    side = payload.get("side")
    if side:
        orders = [order for order in orders if str(order.get("side", "")).upper() == str(side).upper()]
    limit = int(payload.get("limit") or 100)
    return orders[:limit]


def action_balance_allowance(client: ClobClient, payload: Dict[str, Any]) -> Any:
    asset_type = payload.get("asset_type")
    if asset_type not in {AssetType.COLLATERAL, AssetType.CONDITIONAL}:
        raise ValueError("asset_type must be COLLATERAL or CONDITIONAL")
    params = BalanceAllowanceParams(
        asset_type=asset_type,
        token_id=payload.get("token_id"),
        signature_type=int(os.getenv("POLYMARKET_SIGNATURE_TYPE", "0")),
    )
    return client.get_balance_allowance(params)


def action_orders_scoring(client: ClobClient, payload: Dict[str, Any]) -> Any:
    order_ids = payload.get("order_ids") or []
    if not isinstance(order_ids, list) or not order_ids:
        raise ValueError("order_ids must be a non-empty list")
    if len(order_ids) == 1:
        return client.is_order_scoring(OrderScoringParams(orderId=order_ids[0]))
    return client.are_orders_scoring(OrdersScoringParams(orderIds=order_ids))


def partial_options(payload: Dict[str, Any]) -> PartialCreateOrderOptions:
    return PartialCreateOrderOptions(
        tick_size=str(payload.get("tick_size")) if payload.get("tick_size") is not None else None,
        neg_risk=bool(payload.get("neg_risk")) if payload.get("neg_risk") is not None else None,
    )


def action_submit_preview(client: ClobClient, payload: Dict[str, Any]) -> Any:
    kind = payload.get("kind")
    if kind == "limit":
        expiration = payload.get("expiration")
        order = client.create_order(
            OrderArgs(
                token_id=str(payload["token_id"]),
                price=float(payload["price"]),
                size=float(payload["size"]),
                side=str(payload["side"]),
                expiration=int(expiration) if expiration is not None else 0,
            ),
            partial_options(payload),
        )
        order_type = getattr(OrderType, str(payload.get("order_type", "GTC")))
        response = client.post_order(order, orderType=order_type, post_only=bool(payload.get("post_only", False)))
        return {
            "request": payload,
            "response": response,
        }

    if kind == "marketable":
        amount = payload.get("budget_usdc") if str(payload.get("side", "")).upper() == "BUY" else payload.get("shares")
        if amount is None:
            raise ValueError("budget_usdc is required for BUY marketable orders and shares is required for SELL marketable orders")
        order = client.create_market_order(
            MarketOrderArgs(
                token_id=str(payload["token_id"]),
                amount=float(amount),
                side=str(payload["side"]),
                price=float(payload["worst_price"]),
                order_type=getattr(OrderType, str(payload.get("order_type", "FAK"))),
            ),
            partial_options(payload),
        )
        response = client.post_order(order, orderType=getattr(OrderType, str(payload.get("order_type", "FAK"))), post_only=False)
        return {
            "request": payload,
            "response": response,
        }

    raise ValueError(f"unsupported preview kind: {kind}")


def action_cancel_orders(client: ClobClient, payload: Dict[str, Any]) -> Any:
    order_ids = payload.get("order_ids") or []
    if not isinstance(order_ids, list) or not order_ids:
        raise ValueError("order_ids must be a non-empty list")
    if len(order_ids) == 1:
        return client.cancel(order_ids[0])
    return client.cancel_orders(order_ids)


def action_cancel_market_orders(client: ClobClient, payload: Dict[str, Any]) -> Any:
    return client.cancel_market_orders(market=str(payload.get("market") or ""), asset_id=str(payload.get("asset_id") or ""))


def action_cancel_all_orders(client: ClobClient, payload: Dict[str, Any]) -> Any:
    acknowledged = payload.get("acknowledge_all_markets")
    if acknowledged is not True:
        raise ValueError("acknowledge_all_markets must be true")
    return client.cancel_all()


ACTIONS = {
    "open_orders": action_open_orders,
    "balance_allowance": action_balance_allowance,
    "orders_scoring": action_orders_scoring,
    "submit_preview": action_submit_preview,
    "cancel_orders": action_cancel_orders,
    "cancel_market_orders": action_cancel_market_orders,
    "cancel_all_orders": action_cancel_all_orders,
}


def main() -> int:
    try:
        raw = sys.stdin.read()
        request = json.loads(raw or "{}")
        action = request.get("action")
        payload = request.get("payload") or {}
        if action not in ACTIONS:
            raise ValueError(f"unsupported action: {action}")
        client = load_client()
        result = ACTIONS[action](client, payload)
        sys.stdout.write(json.dumps({"ok": True, "result": to_jsonable(result)}, separators=(",", ":")))
        return 0
    except Exception as exc:  # noqa: BLE001
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
