+++
title = "Creating an x86_64 kernel in Rust: Part 3"
description = "Adding a frame allocator"
date = 2025-08-30
draft = true
[taxonomies]
categories = ["rust", "kernel", "x86_64"]
+++

Next we will add a frame allocator, needed to do proper memory mapping which will result in us having the ability to add a heap allocator for our kernel. Allowing us to use Rust's `alloc` crate, giving us access to `Vec` and more.

To implement a frame allocator, need to get a memory map, this map gives us the information of what regions of memory are usable by the kernel.
Some regions of memory may be reserved by the bootloader, ACPI, or simply bad memory due to hardware damage.

We will also need the higher half mapping provided by limine. Limine maps for us all the contiguous physical memory starting at a given "virtual address" which we will call the physical memory offset, this is needed so we can access the level 4 page table. It also gives us an easy way to directly convert a physical address to virtual by simply adding the physical memory offset provided to us.

This information can be provided by limine, by adding a `MemoryMapRequest` and a `HhdmRequest` to `boot.rs`:

```rust

// Add the request

#[used]
#[unsafe(link_section = ".requests")]
pub static MEMORY_MAP_REQUEST: MemoryMapRequest = MemoryMapRequest::new();

// Request the higher-half direct mapping
#[used]
#[unsafe(link_section = ".requests")]
pub static HHDM_REQUEST: HhdmRequest = HhdmRequest::new();

// Add it to the boot info

#[expect(unused)]
pub struct BootInfo {
    pub framebuffer: Framebuffer<'static>,
    pub memory_map: &'static MemoryMapResponse,
    pub physical_memory_offset: VirtAddr,
}

#[unsafe(no_mangle)]
unsafe extern "C" fn kmain() -> ! {
    // ... after framebuffer

    // get the response
    let memory_map = MEMORY_MAP_REQUEST
        .get_response()
        .expect("need the memory map");

    let physical_memory_offset = HHDM_REQUEST
    .get_response()
    .expect("need higher half mapping")
    .offset();

    let boot_info = BootInfo {
        framebuffer,
        memory_map,
        physical_memory_offset,
    };

    BOOT_INFO.call_once(|| boot_info);

    main()
}
```

## Frame allocator

Next create a folder `memory/` where we will put memory related code.

Inside create the `frame_allocator.rs` file and the relevant `pub mod frame_allocator;` in `mod.rs`. Also implement the `get_virt_addr` function which uses the physical memory offset to translate a physical address to virtual.

```rust
// memory/mod.rs

use x86_64::{PhysAddr, VirtAddr};
use crate::boot_info;

pub mod frame_allocator;

/// Get the virtual address from the given physical address
pub fn get_virt_addr(phys: PhysAddr) -> VirtAddr {
    boot_info().physical_memory_offset + phys.as_u64()
}
```

The allocator we will implement will be bitmap based. A bitmap allocator uses one bit per frame - 0 means the frame is free, 1 means it's allocated. This is simple and memory-efficient (just 1 bit per 4KB frame), though finding free frames requires a linear search which can be slow with lots of memory.

```rust
/// Bitmap-based frame allocator
pub struct BitmapFrameAllocator {
    /// Bitmap where each bit represents a frame (0 = free, 1 = allocated)
    bitmap: &'static mut [u8],
    /// Physical address of the first frame managed by this allocator
    start_frame: PhysFrame,
    /// Total number of frames managed
    frame_count: usize,
    /// Hint for the next potentially free frame index (optimization)
    next_free_hint: usize,
}
```

First, we will need to find a place in memory to store the bitmap itself, to do this we will add a `find_bitmap_storage` method, that finds a contiguous memory region to
place the bitmap storage.
We can't use a fixed size bitmap because the memory map may have different sizes depending on the host total memory.

```rust
use limine::{memory_map::EntryType, response::MemoryMapResponse};
use x86_64::{
    PhysAddr,
    structures::paging::{FrameAllocator, PhysFrame, Size4KiB},
};
use crate::{memory::get_virt_addr, serial_println};

/// Calculate the range of frames managed by this allocator. Tracking the minimum usable address and the maximum.
///
/// This range may include unusable frames, but the frame allocator will later mark them as unusable in the bitmap.
fn calculate_frame_range(memory_regions: &MemoryMapResponse) -> (PhysFrame, usize) {
   let usable_regions = memory_regions.entries().iter()
       .filter(|r| r.entry_type == EntryType::USABLE);

   let min_addr = usable_regions.clone().map(|r| r.base).min()
       .expect("No usable memory regions found");
   let max_addr = usable_regions.map(|r| r.base + r.length).max().unwrap();

   let start_frame = PhysFrame::containing_address(PhysAddr::new(min_addr));
   let end_frame: PhysFrame<Size4KiB> = PhysFrame::containing_address(PhysAddr::new(max_addr - 1));
   let frame_count = (end_frame.start_address().as_u64() - start_frame.start_address().as_u64()) / 4096 + 1;

   (start_frame, frame_count as usize)
}

pub fn calculate_bitmap_size(memory_regions: &MemoryMapResponse) -> usize {
        let (_, frame_count) = calculate_frame_range(memory_regions);
        frame_count.div_ceil(8) // Round up to nearest byte
    }

/// Find suitable memory for bitmap storage
fn find_bitmap_storage(
    memory_regions: &MemoryMapResponse,
    required_size: usize,
) -> Option<(&'static mut [u8], u64, usize)> {
    // First, create an iterator of usable entries.
    let usable_regions = memory_regions
        .entries()
        .iter()
        .filter(|r| r.entry_type == EntryType::USABLE);

    // Map it to address ranges
    let mut addr_ranges = usable_regions.map(|r| r.base..(r.base + r.length));

    let mut current = addr_ranges.next()?;

    // Check if first range is sufficient
    if current.end - current.start >= required_size as u64 {
        let phys_addr = PhysAddr::new(current.start);
        let virt_addr = get_virt_addr(phys_addr);

        unsafe {
            // This is safe because:
            // 1. We're using the HHDM mapping provided by limine
            // 2. The physical memory is marked as usable by the bootloader
            // 3. We're only accessing memory within the verified usable range
            let ptr = virt_addr.as_mut_ptr::<u8>();
            let storage = core::slice::from_raw_parts_mut(ptr, required_size);
            return Some((storage, current.start, required_size));
        }
    }

    for range in addr_ranges {
        if current.end == range.start {
            // Extend current range
            current.end = range.end;

            // Check if it fits now
            if current.end - current.start >= required_size as u64 {
                let phys_addr = PhysAddr::new(current.start);
                let virt_addr = get_virt_addr(phys_addr);

                unsafe {
                    // Safe for the same reasons as above
                    let ptr = virt_addr.as_mut_ptr::<u8>();
                    let storage = core::slice::from_raw_parts_mut(ptr, required_size);
                    return Some((storage, current.start, required_size));
                }
            }
        } else {
            // Gap found, start new range
            current = range;

            // Check if this new range is sufficient
            if current.end - current.start >= required_size as u64 {
                let phys_addr = PhysAddr::new(current.start);
                let virt_addr = get_virt_addr(phys_addr);

                unsafe {
                    // Safe for the same reasons as above
                    let ptr = virt_addr.as_mut_ptr::<u8>();
                    let storage = core::slice::from_raw_parts_mut(ptr, required_size);
                    return Some((storage, current.start, required_size));
                }
            }
        }
    }

    None
}
```

With that in place, we can implement the frame allocator:

```rust
impl BitmapFrameAllocator {
    /// Create a new bitmap frame allocator
    ///
    /// # Arguments
    ///
    /// * `memory_regions` - Available memory regions from bootloader
    /// * `bitmap_storage` - Pre-allocated storage for the bitmap
    pub fn new(
        memory_regions: &'static MemoryMapResponse,
        bitmap_storage: &'static mut [u8],
    ) -> Self {
        let (start_frame, frame_count) = calculate_frame_range(memory_regions);

        // Calculate required bitmap size (1 bit per frame)
        let required_bytes = frame_count.div_ceil(8);

        assert!(
            bitmap_storage.len() >= required_bytes,
            "Bitmap storage too small: need {} bytes, got {}",
            required_bytes,
            bitmap_storage.len()
        );

        let mut allocator = Self {
            bitmap: bitmap_storage,
            start_frame,
            frame_count,
            next_free_hint: 0,
        };

        // Mark non-usable frames as allocated
        allocator.mark_non_usable_frames(memory_regions);

        allocator
    }

    /// Mark non-usable frames as allocated in the bitmap
    fn mark_non_usable_frames(&mut self, memory_regions: &MemoryMapResponse) {
        // First mark all frames as allocated
        for byte in self.bitmap.iter_mut() {
            *byte = 0xFF;
        }

        // Then mark usable regions as free
        for region in memory_regions.entries() {
            if region.entry_type == EntryType::USABLE {
                let start_frame = PhysFrame::containing_address(PhysAddr::new(region.base));
                let end_frame =
                    PhysFrame::containing_address(PhysAddr::new(region.base + region.length - 1));

                if let Some(start_idx) = self.frame_to_index(start_frame)
                    && let Some(end_idx) = self.frame_to_index(end_frame)
                {
                    for frame_idx in start_idx..=end_idx {
                        self.set_frame_free(frame_idx);
                    }
                }
            }
        }
    }

    /// Convert frame to bitmap index
    pub fn frame_to_index(&self, frame: PhysFrame) -> Option<usize> {
        let frame_addr = frame.start_address().as_u64();
        let start_addr = self.start_frame.start_address().as_u64();

        if frame_addr < start_addr {
            return None;
        }

        let index = ((frame_addr - start_addr) / 4096) as usize;
        if index >= self.frame_count {
            None
        } else {
            Some(index)
        }
    }

    /// Convert bitmap index to frame
    fn index_to_frame(&self, index: usize) -> Option<PhysFrame> {
        if index >= self.frame_count {
            return None;
        }

        let frame_addr = self.start_frame.start_address().as_u64() + (index as u64 * 4096);
        Some(PhysFrame::containing_address(PhysAddr::new(frame_addr)))
    }

    /// Check if a frame is allocated
    fn is_frame_allocated(&self, index: usize) -> bool {
        if index >= self.frame_count {
            return true; // Out of bounds frames are considered allocated
        }

        let byte_index = index / 8;
        let bit_index = index % 8;
        (self.bitmap[byte_index] & (1 << bit_index)) != 0
    }

    /// Mark a frame as allocated
    pub(super) fn set_frame_allocated(&mut self, index: usize) {
        if index >= self.frame_count {
            return;
        }

        let byte_index = index / 8;
        let bit_index = index % 8;
        self.bitmap[byte_index] |= 1 << bit_index;
    }

    /// Mark a frame as free
    #[inline]
    fn set_frame_free(&mut self, index: usize) {
        if index >= self.frame_count {
            return;
        }

        let byte_index = index / 8;
        let bit_index = index % 8;
        self.bitmap[byte_index] &= !(1 << bit_index);

        // Update hint if this is before our current hint
        if index < self.next_free_hint {
            self.next_free_hint = index;
        }
    }

    /// Find the next free frame starting from the hint
    fn find_free_frame(&mut self) -> Option<usize> {
        // Start from hint and wrap around
        for i in 0..self.frame_count {
            let index = (self.next_free_hint + i) % self.frame_count;
            if !self.is_frame_allocated(index) {
                self.next_free_hint = index + 1;
                return Some(index);
            }
        }
        None
    }

    /// Allocate contiguous frames, useful for some allocations like DMA regions.
    ///
    /// # Arguments
    ///
    /// * `count` - Number of contiguous frames needed
    ///
    /// # Returns
    ///
    /// Returns the first frame of the contiguous block, or None if not available
    pub fn allocate_contiguous_frames(&mut self, count: usize) -> Option<PhysFrame> {
        if count == 0 {
            return None;
        }

        // For single frame, use regular allocation
        if count == 1 {
            return self.allocate_frame();
        }

        // Search for contiguous free frames
        for start_idx in 0..=(self.frame_count.saturating_sub(count)) {
            let mut all_free = true;

            // Check if all frames in range are free
            for offset in 0..count {
                if self.is_frame_allocated(start_idx + offset) {
                    all_free = false;
                    break;
                }
            }

            if all_free {
                // Mark all frames as allocated
                for offset in 0..count {
                    self.set_frame_allocated(start_idx + offset);
                }

                // Update hint
                self.next_free_hint = start_idx + count;

                return self.index_to_frame(start_idx);
            }
        }

        None
    }

    /// Deallocate contiguous frames
    ///
    /// # Arguments
    ///
    /// * `start_frame` - First frame of the contiguous block
    /// * `count` - Number of frames to deallocate
    ///
    /// # Safety
    ///
    /// The frames must have been allocated by this allocator and not be in use
    pub unsafe fn deallocate_contiguous_frames(&mut self, start_frame: PhysFrame, count: usize) {
        if let Some(start_idx) = self.frame_to_index(start_frame) {
            for offset in 0..count {
                if start_idx + offset < self.frame_count {
                    self.set_frame_free(start_idx + offset);
                }
            }
        }
    }

    /// Deallocate a single frame
    ///
    /// # Safety
    ///
    /// The frame must not be in use and must have been allocated by this allocator
    pub unsafe fn deallocate_frame(&mut self, frame: PhysFrame) {
        if let Some(index) = self.frame_to_index(frame) {
            self.set_frame_free(index);
        }
    }

    /// Get allocator statistics
    pub fn stats(&self) -> FrameAllocatorStats {
        let mut allocated_frames = 0;

        for byte in self.bitmap.iter() {
            allocated_frames += byte.count_ones() as usize;
        }

        FrameAllocatorStats {
            total_frames: self.frame_count,
            allocated_frames,
            free_frames: self.frame_count - allocated_frames,
        }
    }
}

/// Implement the x86_64 trait.
unsafe impl FrameAllocator<Size4KiB> for BitmapFrameAllocator {
    fn allocate_frame(&mut self) -> Option<PhysFrame> {
        if let Some(index) = self.find_free_frame() {
            self.set_frame_allocated(index);
            self.index_to_frame(index)
        } else {
            None
        }
    }
}


#[expect(unused)]
#[derive(Debug, Clone, Copy)]
pub struct FrameAllocatorStats {
    pub total_frames: usize,
    pub allocated_frames: usize,
    pub free_frames: usize,
}

```

Finally, add a global and a function to get our frame allocator:

```rust
use spin::{Mutex, MutexGuard, Once};

static FRAME_ALLOCATOR: Once<Mutex<BitmapFrameAllocator>> = Once::new();

/// Returns a lock guard to the frame allocator.
#[must_use]
pub fn frame_allocator() -> MutexGuard<'static, BitmapFrameAllocator> {
    FRAME_ALLOCATOR.get().unwrap().lock()
}

/// Initialize the frame allocator using bootloader memory for bitmap storage
pub fn init_frame_allocator(memory_regions: &'static MemoryMapResponse) {
    // Calculate required bitmap size
    let required_size = calculate_bitmap_size(memory_regions);

    // Find a suitable region for the bitmap
    let (bitmap_storage, storage_start_addr, storage_size) =
        find_bitmap_storage(memory_regions, required_size)
            .expect("No suitable memory region found for frame bitmap");

    // Create and initialize the allocator
    let mut allocator = BitmapFrameAllocator::new(memory_regions, bitmap_storage);

    // Mark bitmap storage frames as allocated
    let frame_count = storage_size.div_ceil(4096); // Round up to frames
    for i in 0..frame_count {
        let frame_addr = storage_start_addr + (i * 4096) as u64;
        let frame = PhysFrame::containing_address(PhysAddr::new(frame_addr));

        if let Some(index) = allocator.frame_to_index(frame) {
            allocator.set_frame_allocated(index);
        }
    }

    FRAME_ALLOCATOR.call_once(|| Mutex::new(allocator));
}
```

Don't forget to declare the memory module in your `main.rs`:

```rust
mod memory;
```

On the `main.rs` file, create an `init()` method:

```rust
use x86_64::{instructions::hlt, structures::paging::FrameAllocator};
use crate::memory::{frame_allocator::init_frame_allocator, frame_allocator::frame_allocator};

fn init() {
    let info = boot_info();
    serial_println!("Initializing the frame allocator");
    init_frame_allocator(info.memory_map);

    serial_println!("Init done");
}
```

And update the main

```rust
fn main() -> ! {
    serial_println!("Booting...");
    init();

    // Test the frame allocator by showing some stats
    let mut allocator = frame_allocator();
    let stats = allocator.stats();
    serial_println!("Frame allocator stats:");
    serial_println!("  Total frames: {}", stats.total_frames);
    serial_println!("  Free frames: {}", stats.free_frames);
    serial_println!("  Allocated frames: {}", stats.allocated_frames);

    // Allocate and deallocate a frame to test it works
    if let Some(frame) = allocator.allocate_frame() {
        serial_println!("Successfully allocated frame at: {:?}", frame.start_address());
        unsafe {
            allocator.deallocate_frame(frame);
        }
        serial_println!("Successfully deallocated frame");
    }
    drop(allocator); // Release the mutex

    loop {
        hlt();
    }
}
```

## Testing it out

When you run the kernel now, you should see output like:

```
Booting...
Initializing frame allocator
Init done
Frame allocator stats:
  Total frames: 517606
  Free frames: 512320
  Allocated frames: 5286
Successfully allocated frame at: PhysAddr(0x10000)
Successfully deallocated frame
```

## Up next

On the next part we will see how to implement a memory mapper using this frame allocator.
