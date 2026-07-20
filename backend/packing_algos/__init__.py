"""
packing_algos — the packing subsystem.

Package root = algorithm-agnostic infrastructure:
  registry.py  — algorithm key → packer function (the dispatch table)
  optimizer.py — cost-minimizing container-combo search over the packer
  scorer.py    — voxel-based fragmentation diagnostic (console-only)

Algorithm implementations live in versioned subpackages (algo_v1/ — the
size-first guillotine packer, registry key "algo1").
"""
