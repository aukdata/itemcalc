# ItemCalc Specification

## 1. Overview

`ItemCalc` is an application for designing GregTech production lines and calculating:

- Required machine counts
- Item throughput
- Fluid throughput
- Power consumption per process
- Total power consumption for the whole line

The user defines a production line made of processes connected by item and fluid transfers.
The calculation starts from one or more target outputs and derives the required upstream processing.

## 2. Domain Model

### 2.1 Material

There are two material types:

- Item
- Fluid

Both are identified by a simple string name.

Examples:

- `Steel Plate`
- `Oxygen`

Quantities:

- Items use `count`
- Fluids use `mB`

Internally, both may use fractional values to support expected values and averaged flow calculations.

### 2.2 Quantity Units

Time is represented in ticks.

- `20t = 1s`

The application should support displaying time and flow both in ticks and seconds.

Examples:

- `40t`
- `2s`
- `3 item/s`
- `120 mB/s`

### 2.3 Process

A process represents one recipe executed by one machine type.

Fields:

- `machineName`
- `inputItems[]`
- `inputFluids[]`
- `outputItems[]`
- `outputFluids[]`
- `circuitNumber?`
- `baseDurationTicks`
- `minimumTier`
- `operatingTier`
- `basePowerEUt`
- `machineCount` (calculated)

Each input or output entry contains:

- `name`
- `amount`
- `type` (`item` or `fluid`)
- `probability?`

`probability` is optional and used for probabilistic outputs.

### 2.4 Production Line

A production line consists of:

- Processes
- Connections between processes
- External inputs
- External outputs
- Disposal outputs

Connections transfer one material type between processes.

## 3. Voltage Tier Model

Supported tiers:

- `ULV`
- `LV`
- `MV`
- `HV`
- `EV`
- `IV`
- `LuV`
- `ZPM`
- `UV`
- `UHV`
- `UEV`
- `UIV`
- `UXV`
- `OpV`
- `MAX`

Tier order is fixed.

A process must not operate below its `minimumTier`.

Tier difference:

```text
tierDelta = operatingTier - minimumTier
```

Overclocking rule:

- Each tier above minimum halves processing time
- Each tier above minimum quadruples EU/t

Formulas:

```text
rawDuration = baseDurationTicks / (2 ^ tierDelta)
actualDurationTicks = max(1, rawDuration)
actualPowerEUt = basePowerEUt * (4 ^ tierDelta)
```

If `actualDurationTicks` reaches `1t`, it is clamped there and never becomes lower than `1t`.

## 4. Target Output

Calculation begins from one or more target outputs.

A target output defines:

- Material name
- Material type
- Required flow amount
- Flow unit

Examples:

- `Steel Plate: 10 item/s`
- `Oxygen: 1000 mB/s`

Internally, target flow should be normalized into a per-tick value.

The calculation is a steady-state average-flow calculation.
Every process input and target output must receive at least its required average
amount per tick. Buffers, transfer timing, startup time, and temporary shortages
are outside the scope of the application.

## 5. Throughput Model

Each process execution consumes and produces a fixed amount per recipe run.

Per-process throughput is derived from actual duration:

```text
runsPerTick = 1 / actualDurationTicks
outputPerTick = amountPerRun / actualDurationTicks
inputPerTick = amountPerRun / actualDurationTicks
```

When a process requires a target throughput, required runs are:

```text
requiredRunsPerTick = requiredOutputPerTick / expectedOutputAmountPerRun
```

## 6. Probabilistic Output

Probabilistic outputs are treated as expected values.

Formula:

```text
expectedAmount = amount * probability
```

Example:

```text
2 item at 30% -> 0.6 item per run
```

Fractional item counts are allowed.

## 7. Multi-Output Process Rule

If a process has multiple outputs, machine requirement must be chosen so that none of the required outputs are underproduced.

For each demanded output:

```text
requiredRunsPerTickForOutput = requiredOutputPerTick / expectedOutputPerRun
```

The process uses the maximum of these values:

```text
requiredRunsPerTick = max(all requiredRunsPerTickForOutput)
```

This guarantees no shortage for any demanded output.
Any surplus output is passed downstream if possible, or disposed of if unused.

## 8. Machine Count and Utilization

Machine count is derived from required runs and actual duration.

Formulas:

```text
theoreticalMachineCount = requiredRunsPerTick * actualDurationTicks
placedMachineCount = ceil(theoreticalMachineCount)
utilization = theoreticalMachineCount / placedMachineCount
```

The application should display both:

- Theoretical machine count
- Actual placed machine count
- Utilization

## 9. Power Consumption

Power must be calculated both per process and for the whole production line.

Per process:

```text
averagePowerEUt = theoreticalMachineCount * actualPowerEUt
maximumPowerEUt = placedMachineCount * actualPowerEUt
```

Whole line:

```text
lineAveragePowerEUt = sum(all process averagePowerEUt)
lineMaximumPowerEUt = sum(all process maximumPowerEUt)
```

The average value represents expected sustained consumption.
The maximum value represents installed capacity requirement.

## 10. Connection Semantics

### 10.1 Merge

If multiple sources provide the same material to the same destination pool, the flows are added.

```text
mergedFlow = sum(all incoming flows)
```

### 10.2 Split

A process output can feed multiple downstream branches.

Split distribution rule:

1. Available output is first distributed equally across all active branches.
2. If a branch receives more than its required amount, its excess is collected.
3. Collected excess is redistributed equally among branches that are still below their required amount.
4. This repeats until either:
   - all branch demands are satisfied, or
   - no distributable output remains
5. If all branch demands are already satisfied and output still remains, the remaining amount is disposed of.

This is effectively a demand-capped equal redistribution rule.

### 10.3 External Input

If a material is not fully supplied by upstream processes, the line may receive the missing amount from an external source.

### 10.4 External Output

A material may be marked as a final exported output target.

### 10.5 Disposal

Any unused material may be routed to disposal.

## 11. Circular Processes

Circular process graphs are allowed.

Examples:

- Byproduct recycling
- Solvent recovery loops
- Self-feeding intermediate loops

Because of cycles, calculation cannot rely only on simple recursive backtracking.
The solver must support simultaneous flow balance across the whole line.

For each material pool, the flow balance is:

```text
totalProduced
+ externalInput
- totalConsumed
- targetOutput
- disposedAmount
= 0
```

The solver must detect and report problematic cases such as:

- No valid solution exists
- The requested targets cannot be satisfied
- The graph allows unbounded production
- The graph is underconstrained and has no unique solution

## 12. Numeric Model

The system should use fractional values internally for:

- Item amount
- Fluid amount
- Flow rates
- Machine counts
- Expected values

Recommended numeric behavior:

- Use deterministic floating-point or decimal arithmetic consistently
- Round only for display, except where integer placement is explicitly required
- Clamp placed machine count to an integer with ceiling

## 13. Display Requirements

The UI should support showing:

- Item flow in `item/t` and `item/s`
- Fluid flow in `mB/t` and `mB/s`
- Duration in `t` and `s`
- Machine counts
- Utilization
- Per-process average and maximum `EU/t`
- Whole-line average and maximum `EU/t`

## 14. Constraints and Assumptions

Current assumptions:

- Material identity is plain string-based
- Probabilities are converted to expected values
- Fractional items are allowed internally
- Calculation uses steady-state average flow
- Buffers and tick-by-tick transfer timing are not modeled
- Minimum process duration is `1t`
- Machine count is automatically calculated
- Split behavior follows equal redistribution with demand caps
- Merge behavior is additive
- Surplus material may be disposed of
- Cycles are allowed

Not yet specified:

- Recipe selection when multiple recipes can produce the same material
- Manual priorities between multiple suppliers
- Belt, pipe, hatch, or bus transport capacity constraints
- Startup transients before steady state
- Batch-size optimization beyond steady-state throughput
- Special machine rules outside the generic overclock model

## 15. Recommended MVP Scope

The first implementation should target:

- Line modeling with processes and connections
- Target-output-driven steady-state calculation
- Overclock-aware machine count calculation
- Split and merge handling
- Per-process and whole-line power totals
- Support for probabilistic outputs as expected values
- Support for cyclic graphs via a global steady-state solver

This is enough to make the application useful for real GregTech planning while keeping the initial scope centered on steady-state throughput analysis.
