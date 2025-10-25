import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';

// Generate unique ID for each component instance
let nextId = 0;

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbDropdownModule],
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.scss']
})
export class PaginationComponent implements OnChanges {
  @Input() pageIndex: number = 0;
  @Input() pageSize: number = 25;
  @Input() totalItems: number = 0;
  @Input() pageSizes: number[] = [10, 25, 50, 100];
  
  @Output() pageChange = new EventEmitter<{pageIndex: number, pageSize: number}>();
  
  public totalPages: number = 0;
  public startItem: number = 0;
  public endItem: number = 0;
  public dropdownId: string = `itemsPerPageDropdown-${nextId++}`;
  
  ngOnChanges(changes: SimpleChanges): void {
    this.updatePaginationInfo();
  }
  
  updatePaginationInfo(): void {
    // Calculate total pages
    this.totalPages = Math.ceil(this.totalItems / this.pageSize);
    
    // Calculate item range for display (1-based for user display)
    this.startItem = this.totalItems === 0 ? 0 : (this.pageIndex * this.pageSize) + 1;
    this.endItem = Math.min((this.pageIndex + 1) * this.pageSize, this.totalItems);
  }
  
  onPageSizeChange(newSize?: number): void {
    // When page size changes, reset to first page to avoid being on an invalid page
    if (newSize !== undefined) {
      this.pageSize = newSize;
    }
    this.pageIndex = 0;
    this.pageChange.emit({ pageIndex: this.pageIndex, pageSize: this.pageSize });
    this.updatePaginationInfo();
  }
  
  selectPageSize(size: number): void {
    this.onPageSizeChange(size);
  }
  
  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages && page !== this.pageIndex) {
      this.pageIndex = page;
      this.pageChange.emit({ pageIndex: this.pageIndex, pageSize: this.pageSize });
      this.updatePaginationInfo();
    }
  }
}
