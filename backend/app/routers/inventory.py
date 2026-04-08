from fastapi import APIRouter, Path, Query, Body
from typing import Optional
from ..models.inventory import (
    CreateInventoryItem, UpdateInventoryItem, CreateTransaction,
    UpdateTransaction, CreateWarehouse, UpdateWarehouse,
)
from ..services.inventory_service import (
    get_warehouses, verify_pin, update_pin,
    create_warehouse, update_warehouse, delete_warehouse,
    create_item, get_items, update_item, delete_item,
    create_transaction, edit_transaction, delete_transaction,
    get_transactions, get_summary,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ─── Warehouses ───────────────────────────────────────────────────────────────
@router.get("/warehouses")
async def list_warehouses():
    return await get_warehouses()


@router.post("/warehouses")
async def add_warehouse(req: CreateWarehouse):
    return await create_warehouse(req.dict())


@router.put("/warehouses/{warehouse_id}")
async def edit_warehouse(warehouse_id: str = Path(...), req: UpdateWarehouse = ...):
    return await update_warehouse(warehouse_id, req.dict(exclude_unset=True))


@router.delete("/warehouses/{warehouse_id}")
async def remove_warehouse(warehouse_id: str = Path(...)):
    return await delete_warehouse(warehouse_id)


@router.post("/warehouses/verify")
async def verify_warehouse_pin(body: dict = Body(...)):
    return await verify_pin(body.get("warehouseId", ""), body.get("pin", ""))


@router.post("/warehouses/change-pin")
async def change_warehouse_pin(body: dict = Body(...)):
    return await update_pin(
        body.get("warehouseId", ""),
        body.get("oldPin", ""),
        body.get("newPin", ""),
    )


# ─── Summary ─────────────────────────────────────────────────────────────────
@router.get("/summary")
async def inventory_summary(warehouseId: str = Query(...)):
    return await get_summary(warehouseId)


# ─── Items ───────────────────────────────────────────────────────────────────
@router.get("/items")
async def list_items(warehouseId: str = Query(...)):
    return await get_items(warehouseId)


@router.post("/items")
async def add_item(req: CreateInventoryItem):
    return await create_item(req.dict())


@router.put("/items/{item_id}")
async def edit_item(item_id: str = Path(...), req: UpdateInventoryItem = ...):
    return await update_item(item_id, req.dict(exclude_unset=True))


@router.delete("/items/{item_id}")
async def remove_item(item_id: str = Path(...)):
    return await delete_item(item_id)


# ─── Transactions ─────────────────────────────────────────────────────────────
@router.get("/transactions")
async def list_transactions(
    warehouseId: str = Query(...),
    itemId: Optional[str] = Query(None),
    limit: int = Query(200),
):
    return await get_transactions(warehouseId, item_id=itemId, limit=limit)


@router.post("/transactions")
async def add_transaction(req: CreateTransaction):
    return await create_transaction(req.dict())


@router.put("/transactions/{tx_id}")
async def modify_transaction(tx_id: str = Path(...), req: UpdateTransaction = ...):
    return await edit_transaction(tx_id, req.dict(exclude_unset=True))


@router.delete("/transactions/{tx_id}")
async def remove_transaction(tx_id: str = Path(...)):
    return await delete_transaction(tx_id)
